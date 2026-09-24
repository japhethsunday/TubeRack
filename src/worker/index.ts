/**
 * TubeRack job worker: `npm run worker` on any long-running host (a VM,
 * Railway/Render service, or the GPU box that runs ComfyUI/WhisperX/ACE-Step).
 * Polls the Supabase `jobs` table and runs jobs through the AI gateway.
 * Needs the same server env as the app (DATABASE_URL, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, provider URLs). Not for serverless.
 */
import { nextRunnableJobs } from "@/src/server/jobs/store";
import { runJob } from "@/src/server/jobs/runner";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000);
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2));
let stopping = false;
const running = new Set<string>();

async function tick(): Promise<void> {
  if (running.size >= CONCURRENCY) return;
  const jobs = await nextRunnableJobs(CONCURRENCY * 2);
  for (const job of jobs) {
    if (stopping || running.size >= CONCURRENCY || running.has(job.id)) continue;
    running.add(job.id);
    void runJob(job.id, job.workspace_id)
      .then((status) => console.log(`[worker] job ${job.id} → ${status}`))
      .catch((error: unknown) => console.error(`[worker] job ${job.id} crashed:`, error instanceof Error ? error.message : error))
      .finally(() => running.delete(job.id));
  }
}

async function main(): Promise<void> {
  console.log(`[worker] started (poll ${POLL_MS}ms, concurrency ${CONCURRENCY})`);
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error("[worker] poll failed:", error instanceof Error ? error.message : error);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  while (running.size > 0) await new Promise((r) => setTimeout(r, 500));
  console.log("[worker] stopped");
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    console.log(`[worker] ${signal}: finishing ${running.size} running job(s)…`);
  });
}

void main();
