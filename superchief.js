import { generateIdeas } from "./ideas.js";
import { filterIdeas } from "./evolution.js";
import { createApps } from "./workers.js";

console.log("SUPERCHIEF ANALYZING FACTORY");

async function runFactory() {

  const ideas = await generateIdeas(10);

  console.log("\nRAW IDEAS:\n");
  ideas.forEach((i, n) => console.log(n + 1 + ".", i));

  const filtered = await filterIdeas(ideas);

  console.log("\nBEST IDEAS:\n");
  filtered.forEach((i, n) => console.log(n + 1 + ".", i));

  console.log("\nAI FACTORY STARTING BUILD\n");

  await createApps(filtered);

}

runFactory();