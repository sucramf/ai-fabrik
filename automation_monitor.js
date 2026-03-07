/**
 * AUTOMATION MONITOR – Produktionsklar.
 * Övervakar alla agenter, stoppar loopar, fel och flaskhalsar. Rapporterar till Superchief.
 */
const state = {
  actions: [],
  maxActions: 500,
  loopThreshold: 6,
  windowMs: 60_000
};

/**
 * @param {string} agentId - e.g. "trend_analyst", "workers", "market_inspector"
 * @param {string} action - e.g. "analyzeTrends", "createApps"
 * @returns {{ allowed: boolean, loopDetected?: boolean, message?: string }}
 */
export function reportAction(agentId, action) {
  const key = `${agentId}:${action}`;
  const now = Date.now();
  state.actions.push({ key, at: now });
  if (state.actions.length > state.maxActions) {
    state.actions = state.actions.slice(-state.maxActions);
  }
  const windowStart = now - state.windowMs;
  const recent = state.actions.filter((a) => a.key === key && a.at >= windowStart);
  const loopDetected = recent.length >= state.loopThreshold;
  return {
    allowed: !loopDetected,
    loopDetected: loopDetected || undefined,
    message: loopDetected ? `Loop detected: ${key} ${recent.length} times in ${state.windowMs / 1000}s. Report to Superchief.` : undefined
  };
}

/**
 * @returns {{ ok: boolean, message: string, bottlenecks?: string[], actionCount?: number }}
 */
export function getStatus() {
  const recent = state.actions.filter((a) => a.at >= Date.now() - state.windowMs);
  const byKey = {};
  for (const a of recent) {
    byKey[a.key] = (byKey[a.key] || 0) + 1;
  }
  const bottlenecks = Object.entries(byKey)
    .filter(([, n]) => n >= state.loopThreshold - 1)
    .map(([k]) => k);
  const ok = bottlenecks.length === 0;
  return {
    ok,
    message: ok ? "No loops or bottlenecks" : "Potential bottlenecks; report to Superchief",
    bottlenecks: bottlenecks.length ? bottlenecks : undefined,
    actionCount: state.actions.length
  };
}

export function reset() {
  state.actions = [];
}
