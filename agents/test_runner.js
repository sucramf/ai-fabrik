/**
 * TEST RUNNER – Run all autonomous tests each cycle (after build pipeline).
 *
 * Generates tests via test_factory, then runs tests/*.test.js (any depth).
 * Writes reports/test_report.json, logs/test_failures.log, logs/tests.log.
 * Does not stop the factory on failure.
 *
 * Note: testers/test_runner.js is the deploy artifact checker; this file runs the autonomous test suite.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const TESTS_DIR = path.join(root, "tests");
const REPORTS_DIR = path.join(root, "reports");
const LOGS_DIR = path.join(root, "logs");
const TEST_REPORT_PATH = path.join(root, "reports", "test_report.json");
const TESTS_LOG = path.join(root, "logs", "tests.log");
const FAILURES_LOG = path.join(root, "logs", "test_failures.log");

async function logTests(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(TESTS_LOG, line, "utf-8").catch(() => {});
}

async function logFailures(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(FAILURES_LOG, line, "utf-8").catch(() => {});
}

async function discoverTestFiles(dir, base = "") {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.join(base, e.name);
    if (e.isDirectory()) {
      out.push(...(await discoverTestFiles(path.join(dir, e.name), rel)));
    } else if (e.name.endsWith(".test.js")) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out;
}

/**
 * Run all tests. Returns { ok, tests_run, passed, failed }.
 */
export async function runAllTests() {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const { runTestFactory } = await import("./test_factory.js").catch(() => ({ runTestFactory: async () => ({ ok: true }) }));
  await runTestFactory().catch(() => {});

  const files = await discoverTestFiles(TESTS_DIR);
  let totalPassed = 0;
  let totalFailed = 0;
  const failures = [];

  for (const rel of files) {
    const full = path.join(TESTS_DIR, rel);
    let mod;
    try {
      mod = await import(pathToFileURL(full).href);
    } catch (e) {
      totalFailed++;
      failures.push({ file: rel, error: (e && e.message) || String(e) });
      await logFailures(rel + ": load error " + (e && e.message));
      continue;
    }
    const run = mod && typeof mod.run === "function" ? mod.run : null;
    if (!run) {
      totalFailed++;
      failures.push({ file: rel, error: "No run() export" });
      await logFailures(rel + ": No run() export");
      continue;
    }
    let result;
    try {
      result = await run();
    } catch (e) {
      totalFailed++;
      failures.push({ file: rel, error: (e && e.message) || String(e) });
      await logFailures(rel + ": " + (e && e.message));
      continue;
    }
    const p = result.passed != null ? result.passed : 0;
    const f = result.failed != null ? result.failed : 0;
    totalPassed += p;
    totalFailed += f;
    if (f > 0 && Array.isArray(result.results)) {
      for (const r of result.results) {
        if (!r.passed) {
          failures.push({ file: rel, test: r.name, error: r.error });
          await logFailures(rel + " > " + r.name + ": " + (r.error || "failed"));
        }
      }
    }
  }

  const testsRun = totalPassed + totalFailed;
  await logTests("Tests executed: " + testsRun + " Passed: " + totalPassed + " Failed: " + totalFailed);

  const report = {
    tests_run: testsRun,
    passed: totalPassed,
    failed: totalFailed,
    failures: failures.length,
    updated: new Date().toISOString()
  };
  await fs.writeFile(TEST_REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  return { ok: true, tests_run: testsRun, passed: totalPassed, failed: totalFailed };
}
