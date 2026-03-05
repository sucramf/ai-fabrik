import fs from "fs";
import { execSync } from "child_process";

const deployDir = "./deploy";

const folders = fs.readdirSync(deployDir)
  .filter(name => name.startsWith("app_"));

let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>AI FABRIK</title>
<style>
body{
font-family:Arial;
max-width:800px;
margin:40px auto;
}
a{
display:block;
margin:12px 0;
font-size:20px;
}
</style>
</head>
<body>

<h1>AI FABRIK</h1>
<p>Automatiskt genererade micro-appar</p>

`;

folders.forEach((name,i)=>{
html += `<a href="./${name}/">App ${i+1}</a>`;
});

html += `
</body>
</html>
`;

fs.writeFileSync("./deploy/index.html", html);

try {

execSync("git add deploy", { stdio: "inherit" });

execSync('git commit -m "deploy apps"', { stdio: "inherit" });

execSync("git subtree push --prefix deploy origin gh-pages", { stdio: "inherit" });

} catch (e) {

console.log("Deploy done");

}