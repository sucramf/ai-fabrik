import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const RETRY_LOG = path.join(root, "logs", "verifier_retries.log");

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
    await fs.mkdir(path.dirname(RETRY_LOG), { recursive: true });
    await fs.appendFile(RETRY_LOG, line + "\n", "utf-8");
  } catch {
  }
}

function buildCorrectivePrompt({ output, verification }) {
  const reason = verification && verification.message ? verification.message : "Unknown reason";
  return [
    "VERIFICATION FAILED",
    "",
    "Reason:",
    reason,
    "",
    "Previous output:",
    typeof output === "string" ? output : JSON.stringify(output || {}, null, 2),
    "",
    "Rewrite the response following protocol:",
    "",
    "DONE:",
    "EVIDENCE:",
    "FAILED:",
    "NEED:",
    "",
    "Include actual proof such as URLs, logs, or API responses.",
  ].join("\n");
}

export async function handleRetry({ output, context = {}, verification }) {
  const attempt = (context.retry_attempt || 0) + 1;

  if (attempt > 3) {
    await log("error", "Maximum verification retries exceeded", {
      stage: context.stage || "unknown",
    });
    return {
      approved: false,
      output,
      verification,
    };
  }

  const correctivePrompt = buildCorrectivePrompt({ output, verification });

  await log("info", "Verification retry scheduled", {
    stage: context.stage || "unknown",
    attempt,
  });

  return {
    approved: false,
    output,
    corrective_prompt: correctivePrompt,
    retry_attempt: attempt,
  };
}
