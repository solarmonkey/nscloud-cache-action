import * as cache from "@actions/cache";
import * as core from "@actions/core";

import { Events, Inputs, Outputs, State, LocalCacheEnabled } from "./constants";
import { IStateProvider } from "./stateProvider";
import * as utils from "./utils/actionUtils";
import { constants } from "buffer";


async function restoreImpl(
    stateProvider: IStateProvider
): Promise<string | undefined> {
    try {
        if (!utils.isCacheFeatureAvailable()) {
            core.setOutput(Outputs.CacheHit, "false");
            return;
        }

        // Validate inputs, this can cause task failure
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        const primaryKey = core.getInput(Inputs.Key, { required: true });
        stateProvider.setState(State.CachePrimaryKey, primaryKey);

        const restoreKeys = utils.getInputAsArray(Inputs.RestoreKeys);
        const cachePaths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });
        const enableCrossOsArchive = utils.getInputAsBool(
            Inputs.EnableCrossOsArchive
        );
        const failOnCacheMiss = utils.getInputAsBool(Inputs.FailOnCacheMiss);
        const lookupOnly = utils.getInputAsBool(Inputs.LookupOnly);
        const localCache = utils.getInputAsBool(Inputs.LocalCache);

        let cacheKey: string | undefined;

        if (localCache) {
            const localCachePath = utils.nscCachePath();
            if (localCachePath === "") {
                core.info(
                    `GitHub runner does not have Namespace cross-invocation cache.`
                );
                throw new Error(
                    `Local cache not found. Did you configure the runs-on labels to enable Namespace cross-invocation cache?`
                );
            }

            core.info(
                `Found Namespace cross-invocation cache at ${localCachePath}.`
            );

            cacheKey = await utils.restoreLocalCache(
                localCachePath,
                cachePaths,
                primaryKey
            );
            stateProvider.setState(LocalCacheEnabled, localCachePath);
        } else {
            cacheKey = await cache.restoreCache(
                cachePaths,
                primaryKey,
                restoreKeys,
                {
                    lookupOnly: lookupOnly,
                    downloadConcurrency: utils.envNumber('CACHE_DOWNLOAD_CONCURRENCY'),
                },
                enableCrossOsArchive
            );
        }

        if (!cacheKey) {
            if (failOnCacheMiss) {
                throw new Error(
                    `Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input key: ${primaryKey}`
                );
            }
            core.info(
                `Cache not found for input keys: ${[
                    primaryKey,
                    ...restoreKeys
                ].join(", ")}`
            );

            return;
        }

        // Store the matched cache key in states
        stateProvider.setState(State.CacheMatchedKey, cacheKey);

        const isExactKeyMatch = utils.isExactKeyMatch(
            core.getInput(Inputs.Key, { required: true }),
            cacheKey
        );

        core.setOutput(Outputs.CacheHit, isExactKeyMatch.toString());
        if (lookupOnly) {
            core.info(`Cache found and can be restored from key: ${cacheKey}`);
        } else {
            core.info(`Cache restored from key: ${cacheKey}`);
        }

        return cacheKey;
    } catch (error: unknown) {
        core.setFailed((error as Error).message);
    }
}

export default restoreImpl;
