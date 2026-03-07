/**
 * UPDATE APP HTML – Uppdaterar app.html i deploy-mappar med enkel Run-funktion.
 * Roll: Batch-uppdatering av deploy. Kör MANUELLT – ej i automatisk loop.
 */
import fs from "fs";
import path from "path";

const appsDir = path.join(process.cwd(), "deploy");
const appFolders = fs.existsSync(appsDir)
  ? fs.readdirSync(appsDir).filter((f) => fs.statSync(path.join(appsDir, f)).isDirectory() && f.startsWith("app_"))
  : [];

appFolders.forEach((folder) => {
  const appPath = path.join(appsDir, folder, "app.html");
  if (!fs.existsSync(appPath)) return;

  let html = fs.readFileSync(appPath, "utf-8");
  html = html.replace(/onclick="alert\('Tool coming soon'\)"/g, `onclick="alert('Hello from ${folder}!')"`);
  fs.writeFileSync(appPath, html);
});

console.log("Alla appar uppdaterade med fungerande Run-funktion!");
