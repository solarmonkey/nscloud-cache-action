import * as path from "path";
import * as exec from "@actions/exec";
import * as fs from "fs";

export const Env_CacheRoot = "NSC_CACHE_PATH";

export function resolveHome(filepath: string): string {
  // Ugly, but should work
  const home = process.env["HOME"] || "~";
  const pathParts = filepath.split(path.sep);
  if (pathParts.length > 1 && pathParts[0] === "~") {
    return path.join(home, ...pathParts.slice(1));
  }
  return filepath;
}

export async function getCacheUtil(cachePath: string): Promise<number> {
  const { stdout } = await exec.getExecOutput(
    `/bin/sh -c "du -sb ${cachePath} | cut -f1"`,
    [],
    {
      silent: true,
      ignoreReturnCode: true,
    }
  );
  const cacheUtil = parseInt(stdout.trim());
  return cacheUtil;
}

export interface CacheMetadata {
  version?: number
  updatedAt?: string
  userRequest?: Map<string, CacheMount>
  preExecution?: ExecutionInfo
  postExecution?: ExecutionInfo
}
export interface CacheMount {
  source: string
  cacheFramework: string
  mountTarget: string[]
}

export interface ExecutionInfo {
  usage: Map<string, number>
}

export async function ensureCacheMetadata(cachePath: string): Promise<CacheMetadata> {
  const namespaceFolderPath = path.join(cachePath, "namespace");
  const metadataFilePath = path.join(namespaceFolderPath, "metadata.json");
  fs.mkdirSync(namespaceFolderPath, { recursive: true });
	if (!fs.existsSync(metadataFilePath)) {
    return {};
	}
  
  const rawData = fs.readFileSync(metadataFilePath, "utf8");
  const metadata: CacheMetadata = JSON.parse(rawData) as CacheMetadata;
  return metadata;
}

export async function writeCacheMetadata(cachePath: string, metadata: CacheMetadata) {
  const namespaceFolderPath = path.join(cachePath, "namespace");
  const metadataFilePath = path.join(namespaceFolderPath, "metadata.json");
  const rawData = JSON.stringify(metadata);
  fs.writeFileSync(metadataFilePath, rawData, {})
}