/**
 * USER FEEDBACK AGENT – Collect and store usage and feedback data per product.
 *
 * Data is stored in feedback/<appId>.json for use by the Product Evolution Engine.
 * Each entry: { timestamp, type: "usage" | "bug" | "feature_request", message }.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const FEEDBACK_DIR = path.join(root, "feedback");

const VALID_TYPES = new Set(["usage", "bug", "feature_request"]);

function normalizeEntry(entry) {
  const type = VALID_TYPES.has(entry?.type) ? entry.type : "usage";
  const message = typeof entry?.message === "string" ? entry.message.trim() : "";
  return {
    timestamp: new Date().toISOString(),
    type,
    message: message || "(no message)"
  };
}

/**
 * Ensure feedback/<appId>.json exists (empty array if missing), optionally append an entry.
 * Never throws on missing files or invalid data.
 *
 * @param {string} appId - App id (e.g. app_123)
 * @param {{ type?: "usage"|"bug"|"feature_request", message?: string }} [entry] - Optional entry to append
 * @returns {Promise<{ ok: boolean, path?: string }>}
 */
export async function collectUserFeedback(appId, entry) {
  try {
    await fs.mkdir(FEEDBACK_DIR, { recursive: true });
  } catch (e) {
    return { ok: false };
  }

  const safeId = (appId || "").toString().replace(/[^a-zA-Z0-9_-]/g, "_").trim() || "unknown";
  const filePath = path.join(FEEDBACK_DIR, `${safeId}.json`);

  let list = [];
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (e.code !== "ENOENT") {
      list = [];
    }
  }

  if (entry != null && typeof entry === "object") {
    const normalized = normalizeEntry(entry);
    list.push(normalized);
  }

  try {
    await fs.writeFile(filePath, JSON.stringify(list, null, 2), "utf-8");
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false };
  }
}
