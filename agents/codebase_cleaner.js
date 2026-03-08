/**
 * CODEBASE CLEANER – Automated cleanup and refactor suggestions.
 *
 * 1. Scans repo (excluding node_modules, .git, quarantine, apps, deploy) for:
 *    duplicate files, unused files, empty folders, unused agents, obsolete logs >30 days.
 * 2. Unused = never imported from entry points → mark unused_candidate, move to quarantine.
 * 3. Duplicate logic >80% similar between two agents → log to refactor_suggestions.log.
 * 4. Ensures standard folder structure exists.
 * 5. Removes .tmp, .cache, .DS_Store (delete only these; never delete code).
 * 6. Never deletes code automatically; only moves to quarantine.
 *
 * Logs: logs/codebase_cleanup.log, logs/refactor_suggestions.log
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const LOGS_DIR = path.join(root, "logs");
const CLEANUP_LOG = path.join(root, "logs", "codebase_cleanup.log");
const REFACTOR_LOG = path.join(root, "logs", "refactor_suggestions.log");
const QUARANTINE_DIR = path.join(root, "quarantine");

const ENTRY_POINTS = ["superchief_daemon.js", "builders/full_product_pipeline.js", "deploy_index.js"];
const SCAN_DIRS = ["agents", "builders", "marketing", "testers"];
const STANDARD_FOLDERS = ["agents", "builders", "apps", "deploy", "data", "logs", "factories", "quarantine"];
const EXCLUDE_DIRS = new Set(["node_modules", ".git", "quarantine", "apps", "deploy"]);
const LOG_MAX_AGE_DAYS = 30;
const DUPLICATE_LOGIC_THRESHOLD = 0.8;

async function logCleanup(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(CLEANUP_LOG, line, "utf-8").catch(() => {});
}

async function logRefactor(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(REFACTOR_LOG, line, "utf-8").catch(() => {});
}

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
}

function resolveImport(fromFile, spec) {
  if (!spec || spec.startsWith(".") === false) return null;
  const fromDir = path.dirname(fromFile);
  const resolved = path.resolve(root, fromDir, spec);
  let rel = path.relative(root, resolved);
  if (!rel.startsWith("..")) return normalizePath(rel);
  return null;
}

const IMPORT_REGEX = /(?:import\s+.*\s+from\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function extractImports(content, fromFile) {
  const out = [];
  let m;
  while ((m = IMPORT_REGEX.exec(content)) !== null) {
    const spec = m[1];
    const resolved = resolveImport(fromFile, spec);
    if (resolved) out.push(resolved);
  }
  return out;
}

async function getReachableFiles() {
  const reached = new Set();
  const queue = [...ENTRY_POINTS];
  while (queue.length) {
    const file = queue.shift();
    const norm = normalizePath(file);
    if (reached.has(norm)) continue;
    if (!norm.endsWith(".js")) continue;
    const full = path.join(root, norm);
    let content;
    try {
      content = await fs.readFile(full, "utf-8");
    } catch {
      continue;
    }
    reached.add(norm);
    const imports = extractImports(content, full);
    for (const imp of imports) {
      const withJs = imp.endsWith(".js") ? imp : imp + ".js";
      if (!reached.has(withJs)) queue.push(withJs);
    }
  }
  return reached;
}

async function listJsFilesInDirs() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const full = path.join(root, dir);
    try {
      await walkDir(full, dir, files, (f) => f.endsWith(".js"));
    } catch {
      // skip
    }
  }
  return files;
}

async function walkDir(dir, base, out, filter) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const rel = path.join(base, e.name);
    if (EXCLUDE_DIRS.has(e.name)) continue;
    if (e.isDirectory()) {
      await walkDir(path.join(dir, e.name), rel, out, filter);
    } else if (filter(e.name)) {
      out.push(rel);
    }
  }
}

async function moveToQuarantine(relPath, subdir) {
  const src = path.join(root, relPath);
  const dest = path.join(QUARANTINE_DIR, subdir, relPath);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(src, dest);
    return true;
  } catch (e) {
    if (e.code === "EXDEV") {
      await fs.cp(src, dest);
      await fs.unlink(src);
      return true;
    }
    return false;
  }
}

async function findUnusedAndMove(reached, allJs) {
  const moved = [];
  const entrySet = new Set(ENTRY_POINTS.map(normalizePath));
  for (const rel of allJs) {
    const norm = normalizePath(rel);
    if (entrySet.has(norm)) continue;
    const withJs = norm.endsWith(".js") ? norm : norm + ".js";
    const withoutJs = norm.endsWith(".js") ? norm.slice(0, -3) : norm;
    const isReached = reached.has(norm) || reached.has(withJs) || reached.has(withoutJs + ".js");
    if (isReached) continue;
    const subdir = rel.startsWith("agents") ? "unused_agents" : rel.startsWith("builders") ? "unused_builders" : "unused_files";
    const ok = await moveToQuarantine(rel, subdir);
    if (ok) moved.push(rel);
  }
  return moved;
}

function contentHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function findDuplicateFiles(allJs) {
  const byHash = new Map();
  for (const rel of allJs) {
    const full = path.join(root, rel);
    let content;
    try {
      content = await fs.readFile(full, "utf-8");
    } catch {
      continue;
    }
    const hash = contentHash(content);
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(rel);
  }
  const duplicates = [];
  for (const [, list] of byHash) {
    if (list.length > 1) duplicates.push(list);
  }
  return duplicates;
}

function normalizeForSimilarity(content) {
  return (content || "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na.length === 0 && nb.length === 0) return 1;
  const linesA = na.split(" ");
  const linesB = nb.split(" ");
  const setB = new Set(linesB);
  let match = 0;
  for (const w of linesA) {
    if (setB.has(w)) match++;
  }
  const union = new Set([...linesA, ...linesB]);
  return union.size === 0 ? 0 : match / Math.max(linesA.length, linesB.length);
}

async function findDuplicateLogic(agentFiles) {
  const pairs = [];
  const contents = new Map();
  for (const rel of agentFiles) {
    const full = path.join(root, rel);
    try {
      contents.set(rel, await fs.readFile(full, "utf-8"));
    } catch {
      // skip
    }
  }
  const list = [...contents.keys()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const sim = similarity(contents.get(a), contents.get(b));
      if (sim >= DUPLICATE_LOGIC_THRESHOLD) pairs.push([a, b, sim]);
    }
  }
  return pairs;
}

async function findEmptyFolders() {
  const empty = [];
  async function check(dir, base) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    const subs = entries.filter((e) => e.isDirectory() && !EXCLUDE_DIRS.has(e.name));
    const files = entries.filter((e) => e.isFile());
    let allSubEmpty = true;
    for (const s of subs) {
      const subEmpty = await check(path.join(dir, s.name), path.join(base, s.name));
      if (!subEmpty) allSubEmpty = false;
    }
    if (files.length === 0 && allSubEmpty && subs.length === 0 && base !== "") empty.push(base);
    return files.length === 0 && allSubEmpty;
  }
  for (const dir of ["agents", "builders", "marketing", "testers", "ideas", "data", "growth", "portfolio", "strategy", "resources"]) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
    } catch {
      continue;
    }
    await check(full, dir);
  }
  return empty;
}

async function moveOldLogs() {
  const logsDir = path.join(root, "logs");
  let entries;
  try {
    entries = await fs.readdir(logsDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  const cutoff = Date.now() - LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let moved = 0;
  const oldDir = path.join(QUARANTINE_DIR, "old_logs");
  await fs.mkdir(oldDir, { recursive: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = path.join(logsDir, e.name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || stat.mtimeMs >= cutoff) continue;
    const dest = path.join(oldDir, e.name);
    try {
      await fs.rename(full, dest);
      moved++;
    } catch {
      // skip
    }
  }
  return moved;
}

async function removeArtifacts() {
  const toRemove = [".tmp", ".cache", ".DS_Store"];
  let removed = 0;
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (toRemove.includes(e.name)) {
          try {
            await fs.rm(full, { recursive: true });
            removed++;
          } catch {
            // skip
          }
        } else {
          await walk(full);
        }
      } else if (e.name === ".DS_Store" || toRemove.includes(e.name)) {
        try {
          await fs.unlink(full);
          removed++;
        } catch {
          // skip
        }
      }
    }
  }
  await walk(root);
  return removed;
}

async function ensureFolderStructure() {
  for (const dir of STANDARD_FOLDERS) {
    const full = path.join(root, dir);
    try {
      await fs.mkdir(full, { recursive: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Main entry. Run every N cycles from daemon.
 * @returns {Promise<{ ok: boolean, unusedMoved?: number, duplicatesDetected?: number, oldLogsMoved?: number, artifactsRemoved?: number, emptyFolders?: number, duplicateLogicPairs?: number }>}
 */
export async function runCodebaseCleaner() {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(QUARANTINE_DIR, { recursive: true });
  await ensureFolderStructure();

  const reached = await getReachableFiles();
  const allJs = await listJsFilesInDirs();

  const duplicateGroups = await findDuplicateFiles(allJs);
  const duplicatesDetected = duplicateGroups.length;
  for (const group of duplicateGroups) {
    await logCleanup("Duplicate files: " + group.join(", "));
  }

  const agentFiles = allJs.filter((f) => f.startsWith("agents/") && !f.includes("node_modules"));
  const duplicateLogicPairs = await findDuplicateLogic(agentFiles);

  const unusedMoved = (await findUnusedAndMove(reached, allJs)).length;

  const emptyFolders = (await findEmptyFolders()).length;
  if (emptyFolders > 0) await logCleanup("Empty folders: " + emptyFolders);

  const oldLogsMoved = await moveOldLogs();
  const artifactsRemoved = await removeArtifacts();
  for (const [a, b, sim] of duplicateLogicPairs) {
    await logRefactor(
      "Duplicate logic detected between:\n" + a + "\n" + b + "\n(Similarity: " + Math.round(sim * 100) + "%)"
    );
  }

  const summary = [
    "Cleanup complete.",
    "Unused files moved: " + unusedMoved,
    "Duplicates detected: " + duplicatesDetected,
    "Old logs moved: " + oldLogsMoved,
    "Artifacts removed: " + artifactsRemoved,
    "Empty folders: " + emptyFolders,
    "Duplicate logic pairs: " + duplicateLogicPairs.length
  ].join(". ");
  await logCleanup(summary);

  return {
    ok: true,
    unusedMoved,
    duplicatesDetected,
    oldLogsMoved,
    artifactsRemoved,
    emptyFolders,
    duplicateLogicPairs: duplicateLogicPairs.length
  };
}
