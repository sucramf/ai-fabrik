import express from "express";
import fs from "fs/promises";
import path from "path";

const app = express();
const root = process.cwd();

const METRICS_PATH = path.join(root, "data", "metrics.json");
const PROJECTS_DIR = path.join(root, "projects");

async function loadJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function loadMetrics() {
  return loadJsonSafe(METRICS_PATH, []);
}

async function loadProjects() {
  try {
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

app.get("/", async (req, res) => {
  const metrics = await loadMetrics();
  const projects = await loadProjects();

  const totalAppsBuilt = projects.length;
  const dailyBuilds = metrics.length;

  const topTraffic = [...metrics]
    .sort((a, b) => (b.traffic || 0) - (a.traffic || 0))
    .slice(0, 5);

  const winners = metrics.filter(
    (m) => m.traffic > 100 && m.signups > 10 && Number(m.conversion || 0) > 2
  );

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AI Factory Metrics Dashboard</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 0; background: #050816; color: #f9fafb; }
    header { padding: 16px 24px; background: #020617; border-bottom: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center; }
    h1 { font-size: 20px; margin: 0; }
    main { padding: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card { background: radial-gradient(circle at top left, #1d4ed8, #020617); border-radius: 12px; padding: 16px 18px; box-shadow: 0 18px 45px rgba(15,23,42,0.9); border: 1px solid rgba(148, 163, 184, 0.25); }
    .card h2 { margin: 0 0 8px 0; font-size: 16px; }
    .stat { font-size: 28px; font-weight: 600; margin-bottom: 4px; }
    .label { font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; }
    ul { padding-left: 18px; margin: 8px 0 0 0; font-size: 13px; }
    li { margin-bottom: 4px; }
    .pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; background: rgba(34,197,94,0.12); color: #bbf7d0; font-size: 11px; margin-left: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>AI Factory Metrics</h1>
    <span class="label">LIVE OVERVIEW</span>
  </header>
  <main>
    <section class="card">
      <div class="label">APPS BUILT</div>
      <div class="stat">${totalAppsBuilt}</div>
      <p style="font-size:13px;color:#9ca3af;">Number of project directories in the factory.</p>
    </section>
    <section class="card">
      <div class="label">RECORDED METRIC ENTRIES</div>
      <div class="stat">${dailyBuilds}</div>
      <p style="font-size:13px;color:#9ca3af;">Proxy for daily builds and activity.</p>
    </section>
    <section class="card">
      <div class="label">TOP TRAFFIC APPS</div>
      <ul>
        ${topTraffic
          .map(
            (m) => `<li>${m.app_id || "unknown"} — ${m.traffic || 0} visits<span class="pill">${
              m.conversion || 0
            }% conversion</span></li>`
          )
          .join("") || "<li>No data yet</li>"}
      </ul>
    </section>
    <section class="card">
      <div class="label">WINNER APPS</div>
      <ul>
        ${winners
          .map(
            (m) => `<li>${m.app_id || "unknown"} — ${m.traffic || 0} traffic / ${
              m.signups || 0
            } signups</li>`
          )
          .join("") || "<li>No winners detected yet</li>"}
      </ul>
    </section>
  </main>
</body>
</html>`);
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Metrics dashboard running on http://localhost:${PORT}`);
});
