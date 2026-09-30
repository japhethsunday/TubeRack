// Phone-size smoke test. Opens the key public pages like a phone would and fails
// on a server error, a crash in the page, or a page wider than the screen.
// Usage: node scripts/smoke.mjs <base-url>
import { chromium, devices } from "playwright";

const base = (process.argv[2] || process.env.SMOKE_URL || "http://localhost:3100").replace(/\/$/, "");
const PAGES = ["/", "/pricing", "/login", "/signup", "/help", "/support", "/contact", "/terms", "/privacy"];

const launch = process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launch);
const context = await browser.newContext({ ...devices["iPhone 13"] });
const problems = [];

for (const path of PAGES) {
  const page = await context.newPage();
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  try {
    const res = await page.goto(base + path, { waitUntil: "networkidle", timeout: 45_000 });
    const status = res?.status() ?? 0;
    if (status >= 500 || status === 0) problems.push(`${path}: HTTP ${status}`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 2) problems.push(`${path}: ${wide}px wider than a phone screen`);
    for (const c of crashes) problems.push(`${path}: page error: ${c.slice(0, 200)}`);
    console.log(`${problems.some((p) => p.startsWith(`${path}:`)) ? "FAIL" : "ok  "} ${path} (${status})`);
  } catch (error) {
    problems.push(`${path}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    console.log(`FAIL ${path}`);
  }
  await page.close();
}

await browser.close();
if (problems.length) {
  console.error(`\nSmoke test failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nSmoke test passed.");
