import fs from "fs/promises";
import path from "path";

/**
 * SYSTEM MONITOR – Detects failed builds, crashed deployments and broken apps.
 *
 * Exports:
 *   - reportSystemStatus(events): Promise<{ failures: any[] }>
 *
 * Events are simple objects like:
 *   { type: "build" | "deployment" | "app", status: "failed" | "ok", id?: string, details?: string }
 *
 * Failures are logged to logs/system_monitor.log. This module does not restart or rollback by itself;
 * it only logs suggested actions for the supervising daemon to execute.
 */

const root = process.cwd();
const LOG_PATH = path.join(root, "logs", "system_monitor.log");

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

export async function reportSystemStatus(events) {
  const list = Array.isArray(events) ? events : [];
  const failures = [];

  for (const ev of list) {
    if (!ev || typeof ev !== "object") continue;
    const status = (ev.status || "").toLowerCase();
    if (status !== "failed") continue;

    const type = (ev.type || "unknown").toLowerCase();
    const id = ev.id || "unknown";

    let suggestedAction = "inspect";
    if (type === "build") suggestedAction = "restart build";
    if (type === "deployment") suggestedAction = "rollback deployment";
    if (type === "app") suggestedAction = "restart app";

    const failure = {
      type,
      id,
      details: ev.details || null,
      suggested_action: suggestedAction,
      reported_at: new Date().toISOString(),
    };

    failures.push(failure);
    await log("error", "System failure detected", failure);
  }

  if (failures.length === 0) {
    await log("info", "System monitor report with no failures", { count: list.length });
  }

  return { failures };
}

async function selfTest() {
  const result = await reportSystemStatus([
    { type: "build", status: "failed", id: "build-1", details: "Unit tests failed" },
    { type: "deployment", status: "ok", id: "deploy-2" },
  ]);
  await log("info", "System monitor self-test", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
