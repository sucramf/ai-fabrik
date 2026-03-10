/**
 * Wrap an agent execution with the verifier.
 *
 * agent: async () => string | object
 * stage: string label for logging
 */
import { judge } from "../core/verifier/judge.js";

export async function runWithVerification(agent, stage, context = {}) {
  const result = await agent();
  const outputText = typeof result === "string" ? result : JSON.stringify(result || {});
  const verification = await judge(outputText, { ...context, stage });
  return { agentResult: result, verification };
}
