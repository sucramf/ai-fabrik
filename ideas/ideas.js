/**
 * IDEAS – Genererar SaaS-idéer via LLM.
 * Roll: generateIdeas(count) → array av idéer. Anropas av Superchief.
 */
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateIdeas(count = 10) {
  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
You are a startup idea generator in March 2026.

Generate ${count} SaaS web tool ideas.

Rules:
- one clear function
- useful for normal people or small businesses
- realistic to build fast
- possible to charge money
- avoid legal risk or sensitive topics
- avoid extremely crowded markets

Return ONLY a numbered list of ideas.
`
  });

  const text = res.output_text;

  const ideas = text
    .split("\n")
    .map((i) => i.replace(/^[0-9\-\.\*\s]+/, "").trim())
    .filter((i) => i.length > 20);

  return ideas;
}
