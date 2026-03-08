/**
 * INSPECTOR PIPELINE – Idea validation before build.
 *
 * Flow: ideas (strings) → market_inspector → legal_inspector → money_inspector → market_value_inspector → approved only.
 * Writes ideas/approved_ideas.json (array of strings). Rejected ideas are not written.
 * Logs to logs/inspector_pipeline.log. Never throws; safe for daemon.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const IDEAS_DIR = path.join(root, "ideas");
const APPROVED_IDEAS_PATH = path.join(root, "ideas", "approved_ideas.json");
const INSPECTOR_LOG_PATH = path.join(root, "logs", "inspector_pipeline.log");

/** Structured log: writes to logs/inspector_pipeline.log */
async function inspectorLog(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload = data !== null && data !== undefined
    ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
    : { level, message };
  const extra = typeof payload === "object" && payload.message
    ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
    : {};
  const line = ts + " [" + (level || "info").toUpperCase() + "] " + (payload.message || message) + (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");
  try {
    await fs.mkdir(path.dirname(INSPECTOR_LOG_PATH), { recursive: true });
    await fs.appendFile(INSPECTOR_LOG_PATH, line + "\n", "utf-8");
  } catch {
    // ignore
  }
}

/** Load inspector module; return inspect function or null on failure. */
async function loadInspector(name, importPath) {
  try {
    const url = pathToFileURL(importPath).href;
    const mod = await import(url);
    const fn = mod.inspectMarket || mod.inspectLegal || mod.inspectMoney || mod.inspectMarketValue;
    if (typeof fn !== "function") return null;
    return fn;
  } catch (e) {
    await inspectorLog("warn", "Inspector module failed to load: " + name, { error: e.message });
    return null;
  }
}

/**
 * Run inspector pipeline: market → legal → money → market_value. Only ideas that pass all four are approved.
 * Writes ideas/approved_ideas.json. Returns { approved, rejected, checked, approvedCount, rejectedCount }.
 * If all ideas rejected, writes [] and logs warning; daemon continues.
 */
export async function runInspectorPipeline(ideas) {
  await inspectorLog("info", "Inspector pipeline start", {});

  const ideasList = Array.isArray(ideas) ? ideas.filter((i) => typeof i === "string" && i.trim()) : [];
  if (ideasList.length === 0) {
    await inspectorLog("warn", "No ideas to check", { checked: 0, approved: 0, rejected: 0 });
    await fs.mkdir(IDEAS_DIR, { recursive: true });
    await fs.writeFile(APPROVED_IDEAS_PATH, "[]", "utf-8");
    return { approved: [], rejected: [], checked: 0, approvedCount: 0, rejectedCount: 0 };
  }

  const marketInspect = await loadInspector("market_inspector", path.join(root, "agents", "inspectors", "market_inspector.js"));
  const legalInspect = await loadInspector("legal_inspector", path.join(root, "agents", "inspectors", "legal_inspector.js"));
  const moneyInspect = await loadInspector("money_inspector", path.join(root, "agents", "inspectors", "money_inspector.js"));
  const marketValueInspect = await loadInspector("market_value_inspector", path.join(root, "agents", "market_value_inspector.js"));

  const approved = [];
  const rejected = [];

  for (const idea of ideasList) {
    const ideaTrim = idea.trim();
    if (!ideaTrim) continue;

    let result = { idea: ideaTrim, approved: false, reason: "" };

    try {
      if (marketInspect) {
        const r = await marketInspect(ideaTrim);
        if (!r.pass && !r.uncertain) {
          result.reason = r.reason || "Market saturated or weak demand";
          rejected.push(result);
          continue;
        }
      }
    } catch (e) {
      await inspectorLog("warn", "Market inspector threw for idea", { idea: ideaTrim.slice(0, 50), error: e.message });
      result.reason = "Market inspector error: " + e.message;
      rejected.push(result);
      continue;
    }

    try {
      if (legalInspect) {
        const r = await legalInspect(ideaTrim);
        if (!r.pass && !r.uncertain) {
          result.reason = r.reason || "Legal/compliance risk";
          rejected.push(result);
          continue;
        }
      }
    } catch (e) {
      await inspectorLog("warn", "Legal inspector threw for idea", { idea: ideaTrim.slice(0, 50), error: e.message });
      result.reason = "Legal inspector error: " + e.message;
      rejected.push(result);
      continue;
    }

    try {
      if (moneyInspect) {
        const r = await moneyInspect(ideaTrim);
        if (!r.pass && !r.uncertain) {
          result.reason = r.reason || "Weak monetization";
          rejected.push(result);
          continue;
        }
      }
    } catch (e) {
      await inspectorLog("warn", "Money inspector threw for idea", { idea: ideaTrim.slice(0, 50), error: e.message });
      result.reason = "Money inspector error: " + e.message;
      rejected.push(result);
      continue;
    }

    try {
      if (marketValueInspect) {
        const r = await marketValueInspect(ideaTrim);
        if (!r.pass && !r.uncertain) {
          result.reason = r.reason || "Insufficient market value";
          rejected.push(result);
          continue;
        }
      }
    } catch (e) {
      await inspectorLog("warn", "Market value inspector threw for idea", { idea: ideaTrim.slice(0, 50), error: e.message });
      result.reason = "Market value inspector error: " + e.message;
      rejected.push(result);
      continue;
    }

    result.approved = true;
    result.reason = "Approved";
    approved.push(ideaTrim);
  }

  await fs.mkdir(IDEAS_DIR, { recursive: true });
  await fs.writeFile(APPROVED_IDEAS_PATH, JSON.stringify(approved, null, 2), "utf-8");

  await inspectorLog("info", "Inspector pipeline complete", {
    checked: ideasList.length,
    approved: approved.length,
    rejected: rejected.length,
    rejectionReasons: rejected.slice(0, 10).map((r) => r.reason)
  });

  if (rejected.length > 0) {
    for (const r of rejected.slice(0, 20)) {
      await inspectorLog("info", "Rejection", { idea: r.idea.slice(0, 60), reason: r.reason });
    }
  }

  if (approved.length === 0) {
    await inspectorLog("warn", "All ideas rejected; build phase will be skipped this cycle", { checked: ideasList.length });
  }

  return {
    approved,
    rejected: rejected.map((r) => ({ idea: r.idea, approved: r.approved, reason: r.reason })),
    checked: ideasList.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length
  };
}
