import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const VERIFIER_LOG = path.join(root, "logs", "verifier.log");
const SECURITY_LOG = path.join(root, "logs", "security_alerts.log");

async function logTo(pathname, level, message, data = null) {
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
    await fs.mkdir(path.dirname(pathname), { recursive: true });
    await fs.appendFile(pathname, line + "\n", "utf-8");
  } catch {
  }
}

async function log(level, message, data) {
  await logTo(VERIFIER_LOG, level, message, data);
}

export async function check_evidence(output) {
  const text = typeof output === "string" ? output : JSON.stringify(output || {});

  const hasDone = text.includes("DONE:");
  const hasEvidenceBlock = text.includes("EVIDENCE:");

  const hasProof =
    text.includes("https://") ||
    text.includes("http://") ||
    text.includes("/logs/") ||
    text.includes("/data/") ||
    text.includes("API 200") ||
    text.includes("API 201");

  if (!hasDone || !hasEvidenceBlock || !hasProof) {
    const message = "Verification Failed: Missing EVIDENCE block or proof references.";
    await log("warn", message, {});
    return { ok: false, code: "evidence_missing", message };
  }

  return { ok: true };
}

export async function check_numbers(output) {
  const text = typeof output === "string" ? output : JSON.stringify(output || {});

  const suspiciousPatterns = [
    /\b(100|250|400|500|1000)\b/, // round or example numbers
    /\b[0-9]{1,3}%/,
  ];

  const hasSuspicious = suspiciousPatterns.some((re) => re.test(text));

  if (!hasSuspicious) {
    return { ok: true };
  }

  const hasEvidence =
    text.includes("analytics") ||
    text.includes("/metrics") ||
    text.includes("database") ||
    text.includes("/data/") ||
    text.includes("/logs/");

  if (!hasEvidence) {
    const message = "Verification Failed: Metrics detected without evidence source.";
    await log("warn", message, {});
    return { ok: false, code: "metrics_without_evidence", message };
  }

  return { ok: true };
}

export async function check_secrets(output) {
  const text = typeof output === "string" ? output : JSON.stringify(output || {});

  const secretRegexes = [
    /sk-[a-zA-Z0-9]{20,}/,
    /ghp_[a-zA-Z0-9]{30,}/,
    /Bearer [a-zA-Z0-9\.-]{10,}/,
    /AIza[0-9A-Za-z\-_]{10,}/,
  ];

  const simplePatterns = ["sk-", "ghp_", "re_", "Bearer", "AIza"];

  const hasSimplePattern = simplePatterns.some((p) => text.includes(p));
  const hasRegexMatch = secretRegexes.some((re) => re.test(text));

  if (!hasSimplePattern && !hasRegexMatch) {
    return { ok: true };
  }

  const redacted = text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-REDACTED")
    .replace(/ghp_[a-zA-Z0-9]{30,}/g, "ghp_REDACTED")
    .replace(/Bearer [a-zA-Z0-9\.-]{10,}/g, "Bearer REDACTED")
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, "AIzaREDACTED");

  const message = "Secret detected and redacted. Pipeline stopped.";
  await logTo(SECURITY_LOG, "error", message, {});

  return {
    ok: false,
    code: "secret_detected",
    message,
    redacted_output: redacted,
  };
}

export async function check_honesty(output) {
  const text = typeof output === "string" ? output : JSON.stringify(output || {});

  const hasDone = text.includes("DONE:");
  const hasFailed = text.includes("FAILED:");
  const hasNeed = text.includes("NEED:");

  if (!hasDone && !hasFailed && !hasNeed) {
    const message = "Verification Failed: Missing protocol tags (DONE, FAILED, NEED).";
    await log("warn", message, {});
    return { ok: false, code: "honesty_protocol_missing", message };
  }

  if (hasDone && !text.includes("EVIDENCE:")) {
    const message = "Verification Failed: DONE present without EVIDENCE block.";
    await log("warn", message, {});
    return { ok: false, code: "done_without_evidence", message };
  }

  return { ok: true };
}

export async function runAllChecks(output, context = {}) {
  const checks = [check_evidence, check_numbers, check_secrets, check_honesty];

  for (const fn of checks) {
    const result = await fn(output, context);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}
