import * as core from "@actions/core";
import * as utils from "./utils";

void main();

async function main() {
    const rawPaths = core.getState(utils.StatePathsKey);
    const cachePaths : utils.CachePath[] = JSON.parse(rawPaths) as utils.CachePath[];
    if (cachePaths.length == 0) {
        core.info(`No paths were cached, skip caching metadata updates.`);
        return;
    }

    const localCachePath = process.env[utils.Env_CacheRoot];
    let metadata = await utils.ensureCacheMetadata(localCachePath);
    metadata.updatedAt = new Date().toISOString();
    if (!metadata.postExecution) {
        metadata.postExecution = {usage: {}};
    }
    
    for (const p of cachePaths) {
        metadata.postExecution.usage[p.pathInCache] = await utils.getCacheUtil(p.pathInCache);
    }
    utils.writeCacheMetadata(localCachePath, metadata);
}