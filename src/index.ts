import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as utils from "./utils";

const Input_Key = "key"; // unused
const Input_Path = "path";
const Input_Cache = "cache";
const Input_FailOnCacheMiss = "fail-on-cache-miss";
const Output_CacheHit = "cache-hit";
const ActionVersion = "nscloud-action-cache@v1";

void main();

async function main() {
  try {
    const localCachePath = process.env[utils.Env_CacheRoot];
    if (localCachePath == null) {
      let hint = `Please update your \x1b[1mruns-on\x1b[0m labels. E.g.:
    
\x1b[32mruns-on\x1b[34m:\x1b[0m
  - \x1b[34mnscloud-ubuntu-22.04-amd64-8x16-\x1b[1mwith-cache\x1b[0m
  - \x1b[34m\x1b[1mnscloud-cache-size-50gb\x1b[0m
  - \x1b[34m\x1b[1mnscloud-cache-tag-my-cache-key\x1b[0m
  
You can replace \x1b[1mmy-cache-key\x1b[0m with something that represents what you’re storing in the cache.`;

      if (process.env.NSC_RUNNER_PROFILE_INFO) {
        hint = "Please enable \x1b[1mCaching\x1b[0m in your runner profile.";
      }

      throw new Error(
        `nscloud-cache-action requires a cache volume to be configured.

${hint}

See also https://namespace.so/docs/features/faster-github-actions#using-a-cache-volume

Are you running in a container? Check out https://namespace.so/docs/actions/nscloud-cache-action#advanced-running-github-jobs-in-containers`
      );
    }
    core.info(`Found Namespace cross-invocation cache at ${localCachePath}.`);

    const cachePaths = await resolveCachePaths(localCachePath);
    const cacheMisses = await restoreLocalCache(cachePaths);

    const fullHit = cacheMisses.length === 0;
    core.setOutput(Output_CacheHit, fullHit.toString());

    if (!fullHit) {
      core.info(`Some cache paths missing: ${cacheMisses}.`);

      const failOnCacheMiss = core.getBooleanInput(Input_FailOnCacheMiss);
      if (failOnCacheMiss) {
        throw new Error(`Some cache paths missing: ${cacheMisses}.`);
      }
    } else {
      core.info("All cache paths found and restored.");
    }

    try {
      // Write/update cache volume metadata file
      const metadata = utils.ensureCacheMetadata(localCachePath);
      metadata.updatedAt = new Date().toISOString();
      metadata.version = 1;
      if (!metadata.userRequest) {
        metadata.userRequest = {};
      }

      for (const p of cachePaths) {
        metadata.userRequest[p.pathInCache] = {
          cacheFramework: p.framework,
          mountTarget: [p.mountTarget],
          source: ActionVersion,
        };
      }
      utils.writeCacheMetadata(localCachePath, metadata);
    } catch (e) {
      core.warning("Failed to record cache metadata.");
      core.info(e.message);
    }

    // Save the list of cache paths to actions state for the post-cache action
    core.saveState(utils.StatePathsKey, cachePaths);

    const cacheUtilInfo = await getCacheSummaryUtil(localCachePath);
    core.info(
      `Total available cache space is ${cacheUtilInfo.size}, and ${cacheUtilInfo.used} have been used.`
    );
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export async function restoreLocalCache(
  cachePaths: utils.CachePath[]
): Promise<string[]> {
  const cacheMisses: string[] = [];

  for (const p of cachePaths) {
    if (!fs.existsSync(p.pathInCache)) {
      cacheMisses.push(p.mountTarget);
    }

    if (p.wipe) {
      await io.rmRF(p.pathInCache);
    }

    const expandedFilePath = utils.resolveHome(p.mountTarget);
    await io.mkdirP(p.pathInCache);
    // Sudo to be able to create dirs in root (e.g. /nix), but set the runner as owner.
    await utils.sudoMkdirP(expandedFilePath);
    await exec.exec(`sudo mount --bind ${p.pathInCache} ${expandedFilePath}`);
  }

  return cacheMisses;
}

async function resolveCachePaths(
  localCachePath: string
): Promise<utils.CachePath[]> {
  const paths: utils.CachePath[] = [];

  const manual: string[] = core.getMultilineInput(Input_Path);
  for (const p of manual) {
    paths.push({ mountTarget: p, framework: "custom" });
  }

  const cacheModes: string[] = core.getMultilineInput(Input_Cache);
  for (const mode of cacheModes) {
    paths.push(...(await resolveCacheMode(mode)));
  }

  for (const p of paths) {
    const expandedFilePath = utils.resolveHome(p.mountTarget);
    const fileCachedPath = path.join(localCachePath, expandedFilePath);
    p.pathInCache = fileCachedPath;
  }

  return paths;
}

async function resolveCacheMode(cacheMode: string): Promise<utils.CachePath[]> {
  switch (cacheMode) {
    case "go": {
      const goCache = await getExecStdout("go env GOCACHE");
      const goModCache = await getExecStdout("go env GOMODCACHE");
      return [
        { mountTarget: goCache, framework: cacheMode },
        { mountTarget: goModCache, framework: cacheMode },
      ];
    }

    case "yarn": {
      const yarnVersion = await getExecStdout("yarn --version");
      const yarnCache = yarnVersion.startsWith("1.")
        ? await getExecStdout("yarn cache dir")
        : await getExecStdout("yarn config get cacheFolder");
      return [{ mountTarget: yarnCache, framework: cacheMode }];
    }

    case "python": {
      const pipCache = await getExecStdout("pip cache dir");
      return [{ mountTarget: pipCache, framework: cacheMode }];
    }

    case "pnpm": {
      const pnpmCache = await getExecStdout("pnpm store path");
      const paths: utils.CachePath[] = [
        { mountTarget: pnpmCache, framework: cacheMode },
      ];

      const json = await getExecStdout("pnpm m ls --depth -1 --json");
      const jsonMultiParse = require("json-multi-parse");
      const parsed = jsonMultiParse(json);

      for (const list of parsed) {
        for (const entry of list) {
          if (entry.path) {
            paths.push({
              mountTarget: `${entry.path}/node_modules`,
              wipe: true,
              framework: cacheMode,
            });
          }
        }
      }

      return paths;
    }

    case "rust":
      // Do not cache the whole ~/.cargo dir as it contains ~/.cargo/bin, where the cargo binary lives
      return [
        { mountTarget: "~/.cargo/registry", framework: cacheMode },
        { mountTarget: "~/.cargo/git", framework: cacheMode },
        { mountTarget: "./target", framework: cacheMode },
        // Cache cleaning feature uses SQLite file https://blog.rust-lang.org/2023/12/11/cargo-cache-cleaning.html
        { mountTarget: "~/.cargo/.global-cache", framework: cacheMode },
      ];

    case "gradle":
      return [
        { mountTarget: "~/.gradle/caches", framework: cacheMode },
        { mountTarget: "~/.gradle/wrapper", framework: cacheMode },
      ];

    case "maven":
      return [{ mountTarget: "~/.m2/repository", framework: cacheMode }];

    case "composer": {
      const composerCache = await getExecStdout(
        "composer config --global cache-files-dir"
      );
      return [{ mountTarget: composerCache, framework: cacheMode }];
    }

    case "poetry": {
      const poetryCache = await getExecStdout("poetry config cache-dir");
      return [{ mountTarget: poetryCache, framework: cacheMode }];
    }

    default:
      core.warning(`Unknown cache option: ${cacheMode}.`);
      return [];
  }
}

async function getExecStdout(cmd: string): Promise<string> {
  const { stdout } = await exec.getExecOutput(cmd, [], {
    silent: true,
  });

  return stdout.trim();
}

type CacheSummaryUtil = {
  size: string;
  used: string;
};

async function getCacheSummaryUtil(
  cachePath: string
): Promise<CacheSummaryUtil> {
  const { stdout } = await exec.getExecOutput(
    `/bin/sh -c "df -h ${cachePath} | awk 'FNR == 2 {print $2,$3}'"`,
    [],
    {
      silent: true,
      ignoreReturnCode: true,
    }
  );
  const cacheUtilData = stdout.trim().split(" ");

  return {
    size: cacheUtilData[0],
    used: cacheUtilData[1],
  };
}
