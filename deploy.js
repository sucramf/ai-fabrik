import fs from "fs";
import path from "path";

const appsDir = path.join("./apps");
const deployFile = path.join("./deploy/index.html");

if (!fs.existsSync(appsDir)) {
  console.log("Apps directory not found!");
  process.exit(1);
}

const apps = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

let linksHTML = "";
apps.forEach(app => {
  linksHTML += `<a href="./apps/${app}/app.html">${app}</a>\n`;
});

const html = `<!DOCTYPE html>
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
<p>Automatiskt genererade micro-appar</p>
${linksHTML}
</body>
</html>
`;

fs.writeFileSync(deployFile, html);
console.log("deploy/index.html updated with working links");