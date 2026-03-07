/**
 * BUILD DEPLOY INDEX – Endast PASS-produkter listas i deploy/index.html.
 * Anropas av Superchief efter stickprovskontroller.
 */
import fs from "fs";
import path from "path";

const deployDir = path.join(process.cwd(), "deploy");

/**
 * @param {string[]} passedAppIds - App IDs that passed test_runner + quality_tester
 */
export function buildDeployIndex(passedAppIds) {
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AI FABRIK</title>
<style>
body { font-family: Arial; max-width: 800px; margin: 40px auto; }
a { display: block; margin: 12px 0; font-size: 20px; }
</style>
</head>
<body>
<h1>AI FABRIK</h1>
<p>Automatiskt genererade micro-appar (PASS only)</p>
`;
  for (const appId of passedAppIds) {
    html += `<a href="./${appId}/">${appId.replace("app_", "App ")}</a>\n`;
  }
  html += `
</body>
</html>
`;
  fs.writeFileSync(path.join(deployDir, "index.html"), html);
}
