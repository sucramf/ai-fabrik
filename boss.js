import { createApps } from "./workers.js";

export async function runFactory(numberOfApps) {

  console.log("AI FACTORY STARTED");

  await createApps(numberOfApps);

}