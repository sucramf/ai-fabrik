import fs from "fs";
import path from "path";

const appsDir = "./deploy/apps";

const appFolders = fs.readdirSync(appsDir).filter(f => fs.statSync(path.join(appsDir, f)).isDirectory());

appFolders.forEach(folder => {
  const appPath = path.join(appsDir, folder, "app.html");
  if (!fs.existsSync(appPath)) return;

  let html = fs.readFileSync(appPath, "utf-8");

  // Ersätt gamla "Tool coming soon" med runApp()
  html = html.replace(/alert\('Tool coming soon'\)/g, "runApp()");

  // Lägg till script längst ner före </body> om det inte redan finns
  if (!html.includes("function runApp()")) {
    const script = `
<script>
function runApp() {
  const appName = "${folder}";
  const now = new Date();
  alert("Hello from " + appName + "! Current time: " + now.toLocaleTimeString());
}
</script>
`;
    html = html.replace("</body>", script + "\n</body>");
  }

  fs.writeFileSync(appPath, html);
});

console.log("Alla appar uppdaterade med unik funktion!");