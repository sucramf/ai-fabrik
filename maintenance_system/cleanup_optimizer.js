/**
 * CLEANUP OPTIMIZER – Automatic codebase cleanup and optimization.
 *
 * Detects and fixes: duplicate files (report only), unused/old files, oversized logs,
 * broken references in deploy, old experiment data. Archives before deleting; never
 * deletes apps/<app_id> or deploy/<app_id>. Creates backups when modifying files.
 *
 * Writes: maintenance_system/cleanup_report.json
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { gzip } from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(gzip);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const MAINTENANCE_DIR = path.join(root, "maintenance_system");
const REPORT_FILE = path.join(MAINTENANCE_DIR, "cleanup_report.json");
const ARCHIVE_DIR = path.join(root, "archive");
const LOGS_DIR = path.join(root, "logs");
const DEPLOY_DIR = path.join(root, "deploy");
const GROWTH_DIR = path.join(root, "growth");
const TESTS_DIR = path.join(root, "tests");
const FACTORY_MONITOR_DIR = path.join(root, "factory_monitor");

const LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;
const REPORT_STALE_MS = 60 * 24 * 60 * 60 * 1000;
const TEMP_NAMES = new Set([".tmp", ".cache", ".DS_Store"]);

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Archive a file: copy to archive/subdir/ then optionally remove original.
 */
async function archiveFile(relPath, subdir, removeOriginal = false) {
  const src = path.join(root, relPath);
  const dest = path.join(ARCHIVE_DIR, subdir, relPath);
  await ensureDir(path.dirname(dest));
  try {
    await fs.copyFile(src, dest);
    if (removeOriginal) await fs.unlink(src);
    return true;
  } catch {
    return false;
  }
}

/**
 * Backup a file before modifying (copy to archive/backup/<timestamp>_<basename>).
 */
async function backupBeforeModify(relPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const basename = path.basename(relPath);
  const backupRel = path.join("backup", timestamp + "_" + basename);
  return archiveFile(relPath, backupRel, false);
}

/**
 * 1. Old logs → archive/logs/
 */
async function archiveOldLogs() {
  const files = [];
  try {
    const entries = await fs.readdir(LOGS_DIR, { withFileTypes: true });
    const cutoff = Date.now() - LOG_MAX_AGE_MS;
    for (const e of entries) {
      if (!e.isFile()) continue;
      const full = path.join(LOGS_DIR, e.name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat || stat.mtimeMs >= cutoff) continue;
      const rel = normalizePath(path.relative(root, full));
      const ok = await archiveFile(rel, "logs", true);
      if (ok) files.push(rel);
    }
  } catch {
    // logs dir missing
  }
  return files;
}

/**
 * 2. Large logs → compress to archive/logs/<name>.gz, then truncate original
 */
async function compressLargeLogs() {
  const files = [];
  try {
    const entries = await fs.readdir(LOGS_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const full = path.join(LOGS_DIR, e.name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat || stat.size < MAX_LOG_SIZE_BYTES) continue;
      const rel = normalizePath(path.relative(root, full));
      await backupBeforeModify(rel);
      const content = await fs.readFile(full);
      const compressed = await gzipAsync(content);
      const archivePath = path.join(ARCHIVE_DIR, "logs", e.name + ".gz");
      await ensureDir(path.dirname(archivePath));
      await fs.writeFile(archivePath, compressed);
      await fs.writeFile(full, "");
      files.push(rel);
    }
  } catch {
    // ignore
  }
  return files;
}

/**
 * 3. Temp files (.tmp, .cache, .DS_Store) → archive/temp/ then delete. Never touch apps/ or deploy/.
 */
async function deleteObsoleteTemp() {
  const files = [];
  const dirsToWalk = ["logs", "growth", "tests", "ideas", "data", "portfolio", "strategy", "resources", "marketing", "factory_monitor", "maintenance_system", "traffic_system", "revenue_system"];
  async function walk(baseDir) {
    const full = path.join(root, baseDir);
    let entries;
    try {
      entries = await fs.readdir(full, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = path.join(baseDir, e.name);
      if (e.isDirectory()) {
        if (TEMP_NAMES.has(e.name)) {
          const abs = path.join(root, rel);
          const dest = path.join(ARCHIVE_DIR, "temp", rel);
          await ensureDir(path.dirname(dest));
          try {
            await fs.cp(abs, dest, { recursive: true });
            await fs.rm(abs, { recursive: true });
            files.push(rel);
          } catch {
            // skip
          }
        } else {
          await walk(rel);
        }
      } else if (e.name === ".DS_Store" || TEMP_NAMES.has(path.extname(e.name))) {
        const abs = path.join(root, rel);
        const dest = path.join(ARCHIVE_DIR, "temp", rel);
        await ensureDir(path.dirname(dest));
        try {
          await fs.copyFile(abs, dest);
          await fs.unlink(abs);
          files.push(rel);
        } catch {
          // skip
        }
      }
    }
  }
  for (const d of dirsToWalk) {
    try {
      await fs.access(path.join(root, d));
    } catch {
      continue;
    }
    await walk(d);
  }
  return files;
}

/**
 * 4. Old experiment/report data in growth/, tests/, factory_monitor/ → archive/reports/
 */
async function archiveOldReports() {
  const files = [];
  const cutoff = Date.now() - REPORT_STALE_MS;
  const dirs = [
    { dir: GROWTH_DIR, base: "growth" },
    { dir: TESTS_DIR, base: "tests" },
    { dir: FACTORY_MONITOR_DIR, base: "factory_monitor" }
  ];
  for (const { dir, base } of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const stat = await fs.stat(full).catch(() => null);
        if (!stat) continue;
        if (stat.isDirectory()) continue;
        if (stat.mtimeMs >= cutoff) continue;
        const rel = path.join(base, e.name);
        const ok = await archiveFile(rel, "reports", true);
        if (ok) files.push(rel);
      }
    } catch {
      // dir missing
    }
  }
  return files;
}

/**
 * 5. Broken references: deploy/<id>/app.html references missing assets.
 */
async function findBrokenReferences() {
  const broken = [];
  let appDirs = [];
  try {
    appDirs = await fs.readdir(DEPLOY_DIR, { withFileTypes: true });
  } catch {
    return broken;
  }
  for (const e of appDirs) {
    if (!e.isDirectory() || !e.name.startsWith("app_")) continue;
    const appId = e.name;
    const htmlPath = path.join(DEPLOY_DIR, appId, "app.html");
    let content;
    try {
      content = await fs.readFile(htmlPath, "utf-8");
    } catch {
      continue;
    }
    const refs = [...content.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1].trim());
    const baseDir = path.join(DEPLOY_DIR, appId);
    for (const ref of refs) {
      if (ref.startsWith("http") || ref.startsWith("//") || ref.startsWith("#")) continue;
      const resolved = path.resolve(baseDir, ref);
      const rel = path.relative(root, resolved);
      if (rel.startsWith("..")) continue;
      try {
        await fs.access(resolved);
      } catch {
        broken.push(rel);
      }
    }
  }
  return broken;
}

/**
 * 6. Duplicate templates: same content hash across apps (report only).
 */
async function findDuplicateTemplates() {
  const byHash = new Map();
  let appDirs = [];
  try {
    appDirs = await fs.readdir(path.join(root, "apps"), { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of appDirs) {
    if (!e.isDirectory() || !e.name.startsWith("app_")) continue;
    const htmlPath = path.join(root, "apps", e.name, "app.html");
    let content;
    try {
      content = await fs.readFile(htmlPath, "utf-8");
    } catch {
      continue;
    }
    const hash = createHash("sha256").update(content).digest("hex");
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push("apps/" + e.name + "/app.html");
  }
  const groups = [];
  for (const list of byHash.values()) {
    if (list.length > 1) groups.push(list);
  }
  return groups;
}

/**
 * Run cleanup optimizer. Never deletes apps/<app_id> or deploy/<app_id>. Archives before delete.
 * @returns {Promise<{ ok: boolean, report: object }>}
 */
export async function runCleanupOptimizer() {
  const timestamp = new Date().toISOString();
  const actions = [];

  await ensureDir(ARCHIVE_DIR);
  await ensureDir(MAINTENANCE_DIR);

  const archiveLogsFiles = await archiveOldLogs();
  if (archiveLogsFiles.length > 0) {
    actions.push({ type: "archive_logs", files: archiveLogsFiles });
  }

  const compressedFiles = await compressLargeLogs();
  if (compressedFiles.length > 0) {
    actions.push({ type: "compress_large_logs", files: compressedFiles });
  }

  const tempFiles = await deleteObsoleteTemp();
  if (tempFiles.length > 0) {
    actions.push({ type: "delete_obsolete_temp", files: tempFiles });
  }

  const reportFiles = await archiveOldReports();
  if (reportFiles.length > 0) {
    actions.push({ type: "archive_old_reports", files: reportFiles });
  }

  const brokenRefs = await findBrokenReferences();
  if (brokenRefs.length > 0) {
    actions.push({ type: "broken_references", files: brokenRefs });
  }

  const duplicateGroups = await findDuplicateTemplates();
  if (duplicateGroups.length > 0) {
    actions.push({
      type: "merge_duplicate_templates",
      files: duplicateGroups.flat(),
      duplicate_groups: duplicateGroups
    });
  }

  const report = {
    timestamp,
    actions
  };

  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf-8");

  return { ok: true, report };
}
