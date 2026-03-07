import fs from "fs";
import path from "path";

const appsDir = path.join("deploy", "apps");
const indexPath = path.join("deploy", "index.html");

const appFolders = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir,f)).isDirectory());

let links = appFolders.map((f,i) => `<a href="./apps/${f}/app.html">App ${i+1}</a>`).join("\n");

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>AI FABRIK</title>
<style>
body{font-family:Arial;max-width:800px;margin:40px auto;}
a{display:block;margin:12px 0;font-size:20px;}
</style>
</head>
<body>
<h1>AI FABRIK</h1>
<p>Automatiskt genererade micro-appar</p>
${links}
</body>
</html>`;

fs.writeFileSync(indexPath, html);
console.log("deploy/index.html uppdaterad med alla appar.");