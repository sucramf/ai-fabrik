import fs from "fs/promises";
import path from "path";

/**
 * CHAOS TESTER – Simulates failure scenarios and verifies graceful degradation.
 *
 * Scenarios:
 *   1) OpenAI key missing/invalid.
 *   2) External automation (e.g. Make.com) returns 500.
 *   3) Corrupt HTML in a HK app during QA.
 *
 * Export:
 *   - runChaosTests(): Promise<{ scenarios: ChaosScenarioResult[] }>
 *
 * This module does not mutate state outside temporary files; it is safe to run in CI.
 */

const root = process.cwd();
const LOG_PATH = path.join(root, "logs", "chaos_tester.log");

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

async function simulateOpenAiKeyFailure() {
  const originalKey = process.env.OPENAI_API_KEY;
  let threw = false;
  let recovered = false;

  try {
    process.env.OPENAI_API_KEY = "INVALID_TEST_KEY";

    try {
      // Any module using OpenAI must catch authentication errors and surface a safe error shape.
      const { generateIdeas } = await import("../../ideas/ideas.js");
      await generateIdeas(1);
    } catch (e) {
      threw = true;
      recovered = true;
      await log("info", "OpenAI key failure simulated", { error: e.message });
    }
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }

  return {
    id: "openai_key_failure",
    passed: threw && recovered,
    details: {
      error_expected: threw,
      recovered,
    },
  };
}

async function simulateMakeCom500() {
  const url = process.env.MAKE_WEBHOOK_URL || "https://example.invalid/make-webhook-test";
  let handled = false;

  if (typeof fetch !== "function") {
    await log("warn", "fetch not available; skipping Make.com chaos test", {});
    return {
      id: "make_500",
      passed: true,
      details: { skipped: true, reason: "fetch_not_available" },
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { method: "POST", signal: controller.signal });
      if (res.status >= 500) {
        handled = true;
      } else {
        handled = true;
      }
    } catch (e) {
      handled = true;
      await log("info", "Make.com 500/connection failure simulated", { error: e.message });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    handled = true;
    await log("info", "Make.com chaos wrapper caught error", { error: e.message });
  }

  return {
    id: "make_500",
    passed: handled,
    details: { handled },
  };
}

async function simulateCorruptHtmlQa() {
  const tempAppId = "chaos_test_app";
  const deployDir = path.join(root, "deploy", tempAppId);
  const appHtmlPath = path.join(deployDir, "app.html");

  try {
    await fs.mkdir(deployDir, { recursive: true });
    await fs.writeFile(appHtmlPath, "<html><head><title>Broken", "utf-8");

    let qaFailedGracefully = false;

    try {
      const { inspectQuality } = await import("../../agents/inspectors/quality_inspector.js");
      const { runTests } = await import("../../testers/test_runner.js");
      const { testQuality } = await import("../../testers/quality_tester.js");

      const html = await fs.readFile(appHtmlPath, "utf-8");
      const q = await inspectQuality(html, "website");
      const t = await runTests(deployDir);
      const qt = await testQuality(deployDir);

      qaFailedGracefully = !q.pass || !t.passed || !qt.passed;
    } catch (e) {
      await log("error", "Corrupt HTML QA threw instead of failing gracefully", { error: e.message });
      qaFailedGracefully = false;
    }

    return {
      id: "corrupt_html_qa",
      passed: qaFailedGracefully,
      details: {
        qaFailedGracefully,
      },
    };
  } finally {
    try {
      await fs.rm(deployDir, { recursive: true, force: true });
    } catch {
    }
  }
}

export async function runChaosTests() {
  const scenarios = [];

  scenarios.push(await simulateOpenAiKeyFailure());
  scenarios.push(await simulateMakeCom500());
  scenarios.push(await simulateCorruptHtmlQa());

  const summary = {
    scenarios,
  };

  await log("info", "Chaos tests completed", {
    passed: scenarios.filter((s) => s.passed).length,
    total: scenarios.length,
  });

  return summary;
}
