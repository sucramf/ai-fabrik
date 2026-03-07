/**
 * BOSS – Delegerar byggjobb till workers.
 * Roll: Tar emot antal/idéer från Superchief och anropar workers.
 */
import { createApps } from "./workers.js";

export async function runFactory(numberOfApps) {
  console.log("AI FACTORY STARTED");
  await createApps(numberOfApps);
}
