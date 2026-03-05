import fs from "fs";
import path from "path";

const appsDir = "./apps";
const deployDir = "./deploy";

if (!fs.existsSync(deployDir)) {
  fs.mkdirSync(deployDir);
}

const apps = fs.readdirSync(appsDir);

apps.forEach((app) => {

  const src = path.join(appsDir, app);
  const dest = path.join(deployDir, app);

  if (!fs.existsSync(src)) return;

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  fs.mkdirSync(dest);

  const files = fs.readdirSync(src);

  files.forEach((file) => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    fs.copyFileSync(srcFile, destFile);
  });

});

console.log("apps copied to deploy");