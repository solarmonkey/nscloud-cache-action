import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as utils from "./utils.js";

const Env_CacheRoot = "NSC_CACHE_PATH";
const Input_Key = "key"; // unused
const Input_Path = "path";
const Input_FailOnCacheMiss = "fail-on-cache-miss";
const Output_CacheHit = "cache-hit";

void main();

async function main() {
  const cachePaths = core.getMultilineInput(Input_Path, { required: true });
  const localCachePath = process.env[Env_CacheRoot];
  if (localCachePath == null) {
    throw new Error(
      `Local cache not found. Did you configure the runs-on labels to enable Namespace cross-invocation cache?`
    );
  }
  core.info(`Found Namespace cross-invocation cache at ${localCachePath}.`);

  const cacheMisses = await restoreLocalCache(localCachePath, cachePaths);

  const fullHit = cacheMisses.length === 0;
  core.setOutput(Output_CacheHit, fullHit.toString());

  if (!fullHit) {
    core.warning(`Some cache paths missing: ${cacheMisses}.`);

    const failOnCacheMiss = core.getBooleanInput(Input_FailOnCacheMiss);
    if (failOnCacheMiss) {
      throw new Error(`Some cache paths missing: ${cacheMisses}.`);
    }
  } else {
    core.info(`All cache paths found and restored.`);
  }

  const { stdout } = await exec.getExecOutput(
    `/bin/sh -c "df -h ${localCachePath} | awk 'FNR == 2 {print $2,$3}'"`, [], {
    silent: true,
    ignoreReturnCode: true    
  });
  const cacheUtilData = stdout.trim().split(' ');
  core.info(`Total available cache space is ${cacheUtilData[0]}, and ${cacheUtilData[1]} have been used.`);
}

export async function restoreLocalCache(
  localCachePath: string,
  cachePath: string[]
): Promise<string[]> {
  const cacheMisses: string[] = [];

  for (const p of cachePath) {
    const expandedFilePath = utils.resolveHome(p);
    const fileCachedPath = path.join(localCachePath, expandedFilePath);
    if (!fs.existsSync(fileCachedPath)) {
      cacheMisses.push(p);
    }
    await io.mkdirP(fileCachedPath);
    await io.mkdirP(expandedFilePath);
    await exec.exec(`sudo mount --bind ${fileCachedPath} ${expandedFilePath}`);
  }

  return cacheMisses;
}
