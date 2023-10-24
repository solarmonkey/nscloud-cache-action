import * as path from "path";

export function resolveHome(filepath: string): string {
  // Ugly, but should work
  const home = process.env["HOME"] || "~";
  const pathParts = filepath.split(path.sep);
  if (pathParts.length > 1 && pathParts[0] === "~") {
    return path.join(home, ...pathParts.slice(1));
  }
  return filepath;
}
