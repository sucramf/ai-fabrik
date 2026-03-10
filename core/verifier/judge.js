import fs from "fs/promises";
import path from "path";
import { runAllChecks } from "./verification_rules.js";
import { handleRetry } from "./retry_controller.js";

/**
 * JUDGE – Central verification entry point.
 *
 * Export:
 *   - judge(output, context): Promise<{ approved: boolean, output: any, verification: any }>
 */

const root = process.cwd();
const LOG_PATH = path.join(root, "logs", "verifier.log");

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

export async function judge(output, context = {}) {
  const verification = await runAllChecks(output || "", context);

  if (verification.ok) {
    await log("info", "Verification approved", { stage: context.stage || "unknown" });
    return { approved: true, output, verification };
  }

  await log("warn", "Verification rejected", {
    stage: context.stage || "unknown",
    reason: verification.message,
  });

  const retryResult = await handleRetry({ output, context, verification });

  if (retryResult.approved) {
    return retryResult;
  }

  return {
    approved: false,
    output: retryResult.output,
    verification,
  };
}
