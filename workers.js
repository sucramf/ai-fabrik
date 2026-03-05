import fs from "fs/promises";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateApp(idea) {

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
Create a modern SaaS-style web app.

Use:
- HTML
- Tailwind CDN
- simple JavaScript

Requirements:
- modern SaaS layout
- header
- hero
- feature section
- working UI tool

Idea:
${idea}

Return only the full HTML file.
`
  });

  return res.output[0].content[0].text;
}

async function generateMarketing(idea) {

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
Write a short landing page marketing text.

Include:
- headline
- 3 benefits
- short CTA

Idea:
${idea}
`
  });

  return res.output[0].content[0].text;
}

async function createLandingPage(idea, marketing) {

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
Create a simple SaaS landing page.

Use:
- HTML
- Tailwind CDN

Include:
- headline
- benefits
- CTA
- clean SaaS layout

Marketing text:
${marketing}

Idea:
${idea}

Return full HTML.
`
  });

  return res.output[0].content[0].text;
}

async function createOneApp(idea) {

  const [appCode, marketingText] = await Promise.all([
    generateApp(idea),
    generateMarketing(idea)
  ]);

  const landingPage = await createLandingPage(idea, marketingText);

  const id = `app_${Date.now()}_${Math.floor(Math.random()*10000)}`;

  const appFolder = `apps/${id}`;
  const deployFolder = `deploy/${id}`;

  await fs.mkdir(appFolder, { recursive: true });
  await fs.mkdir(deployFolder, { recursive: true });

  await fs.writeFile(`${appFolder}/idea.txt`, idea);
  await fs.writeFile(`${appFolder}/app.html`, appCode);
  await fs.writeFile(`${appFolder}/marketing.txt`, marketingText);

  await fs.writeFile(`${deployFolder}/index.html`, landingPage);
  await fs.writeFile(`${deployFolder}/app.html`, appCode);

  console.log("APP CREATED:", id);

}

export async function createApps(ideas) {

  if (!Array.isArray(ideas)) {

    ideas = ideas
      .split("\n")
      .map(i => i.replace(/^[0-9]+\.\s*/, "").trim())
      .filter(Boolean);
  }

  for (const idea of ideas) {
    await createOneApp(idea);
  }

  console.log("DONE BUILDING APPS");

}