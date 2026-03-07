import fs from "fs";
import path from "path";

const appsDir = "./apps";
const deployDir = "./deploy";

// Se till att deploy finns
if (!fs.existsSync(deployDir)) {
  fs.mkdirSync(deployDir);
}

// Läs alla app-mappar
const apps = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

// Skapa index.html
let html = `
<!DOCTYPE html>
<html>
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
<p>Automatiskt genererade micro-appar</p>
`;

apps.forEach((app, i) => {
  html += `<a href="./${app}/">${app.replace("app_", "App ")}</a>\n`;
});

html += `
</body>
</html>
`;

fs.writeFileSync(path.join(deployDir, "index.html"), html);
console.log("deploy/index.html uppdaterad");