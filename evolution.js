import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function filterIdeas(ideas) {

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
You are a ruthless SaaS market analyst.

Your job is to pick the BEST ideas.

Rules:
- choose ideas with real demand
- avoid saturated markets
- avoid legal risk
- avoid sensitive topics
- prefer tools businesses pay for
- prefer SaaS opportunities

Return ONLY a JSON array of the best ideas.

Example:
["idea 1","idea 2","idea 3"]

Ideas:
${ideas.join("\n")}
`
  });

  const text = res.output[0].content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    console.log("AI returned invalid JSON, fallback to first 3 ideas");
    return ideas.slice(0,3);
  }

}