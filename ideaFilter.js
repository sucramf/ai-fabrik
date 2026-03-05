import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function filterIdea(idea) {

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `

You are a ruthless startup investor in 2026.

Your job is to judge startup ideas.

Reject ideas that are:

- legally risky
- ethically sensitive
- medical, immigration, asylum, legal advice
- financial advice
- extremely saturated markets
- easily replaced by ChatGPT
- impossible to monetize

Prefer ideas that:

- solve a clear problem
- are niche
- are monetizable as SaaS
- have existing demand
- have moderate competition
- could realistically earn money in 2026

Idea:

${idea}

Answer ONLY with:

PASS
or
REJECT

`
  });

  const answer = res.output_text.trim();

  return answer === "PASS";
}