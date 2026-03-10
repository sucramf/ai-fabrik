import fs from "fs/promises";
import path from "path";

/**
 * VERCEL BRIDGE – Prepares static output from deploy/ for Vercel.
 *
 * Export:
 *   - prepareVercelStaticDeploy(sourceDir?: string): Promise<{ ok: boolean, source: string, target: string, filesCopied: number }>
 *
 * Behavior:
 *   - Copies the contents of the build directory (default: deploy/) into .vercel/output/static.
 *   - Does not call Vercel APIs; it only prepares the folder structure expected by Vercel for static deployments.
 */

const root = process.cwd();
const DEFAULT_SOURCE = path.join(root, "deploy");
const VERCEL_STATIC_DIR = path.join(root, ".vercel", "output", "static");
const LOG_PATH = path.join(root, "logs", "vercel_bridge.log");

async function log(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload =
    data != null && data !== undefined
      ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
      : { level, message };
  const extra =
    typeof payload === "object" && payload.message
      ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
      : {};
  const line =
    ts +
    " [" + (level || "info").toUpperCase() + "] " +
    (payload.message || message) +
    (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");

  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, line + "\n", "utf-8");
  } catch {
  }
}

async function copyRecursive(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  let count = 0;

  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      count += await copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
      count += 1;
    }
  }

  return count;
}

export async function prepareVercelStaticDeploy(sourceDir = DEFAULT_SOURCE) {
  const source = sourceDir || DEFAULT_SOURCE;
  const target = VERCEL_STATIC_DIR;

  try {
    await fs.access(source);
  } catch {
    await log("warn", "Source deploy directory does not exist", { source });
    return { ok: false, source, target, filesCopied: 0 };
  }

  try {
    await fs.mkdir(target, { recursive: true });
    const filesCopied = await copyRecursive(source, target);
    await log("info", "Vercel static directory prepared", { source, target, filesCopied });
    return { ok: true, source, target, filesCopied };
  } catch (e) {
    await log("error", "Failed to prepare Vercel static directory", { source, target, error: e.message });
    return { ok: false, source, target, filesCopied: 0 };
  }
}
