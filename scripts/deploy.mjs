// Safe deploy: nothing reaches the live site (main) unless every check passes.
// 1. clean working tree  2. type check, lint, tests  3. production build
// 4. phone-size smoke test on that build  5. fast-forward main (never force)
// Then GitHub Actions ("Live check") waits for the live site to serve this
// exact commit and runs the smoke test against it.
import { execSync, spawn } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const step = (s) => console.log(`\n▶ ${s}`);
const fail = (s) => {
  console.error(`\n✖ Deploy stopped: ${s}\nNothing was deployed.`);
  process.exit(1);
};

step("Checking for uncommitted changes");
if (out("git status --porcelain")) fail("there are uncommitted changes. Commit them first.");
const sha = out("git rev-parse HEAD");

step("Type check, lint, tests");
try {
  run("npx tsc --noEmit -p .");
  run("npm run lint --silent");
  run("npm test --silent");
} catch {
  fail("a check failed (see above).");
}

step("Production build");
try {
  run("npm run build");
} catch {
  fail("the build failed.");
}

step("Phone-size smoke test on the build");
const port = 3197;
const server = spawn("npx", ["next", "start", "-p", String(port)], { stdio: "ignore", detached: true });
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!up) fail("the built app didn't start.");
  run(`node scripts/smoke.mjs http://localhost:${port}`);
} catch {
  fail("the smoke test failed.");
} finally {
  try {
    process.kill(-server.pid);
  } catch {
    // already stopped
  }
}

step("Publishing to main");
run("git fetch -q origin main");
try {
  execSync("git merge-base --is-ancestor origin/main HEAD");
} catch {
  fail("main has changes this branch doesn't. Merge origin/main in first, then deploy again.");
}
run("git push origin HEAD:main");
run("git push -q origin HEAD");

console.log(`\n✔ Deployed ${sha.slice(0, 7)} to main. Vercel is building it now.`);
console.log(`  The "Live check" in GitHub Actions confirms when https://www.recktube.xyz serves ${sha.slice(0, 7)} and re-runs the phone test there.`);
