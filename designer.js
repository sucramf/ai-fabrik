import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function improveUI(html) {

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
You are a senior UI/UX designer.

Improve this SaaS web app UI.

Requirements:
- modern SaaS style
- better layout
- better spacing
- better Tailwind usage
- modern colors
- modern buttons
- responsive

Keep functionality intact.

Return ONLY the full improved HTML file.

APP:

${html}
`
  });

  return res.output[0].content[0].text;

}