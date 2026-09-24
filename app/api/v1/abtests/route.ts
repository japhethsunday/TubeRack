import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { createTest, listTests } from "@/src/server/growth/abtests";
import { providerFailure } from "@/src/server/ai/guard";
import { toErrorResponse, validationError } from "@/src/server/errors";

export const maxDuration = 30;

/** GET /api/v1/abtests — thumbnail tests in this workspace. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    return NextResponse.json({ data: await listTests(workspaceId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/abtests (multipart) — videoId, videoTitle, rotateHours, cycles, files[], labels[]. */
export async function POST(request: Request) {
  try {
    const caller = await requireWorkspace("editor");
    const form = await request.formData().catch(() => null);
    if (!form) throw validationError("Send the test as multipart form data.");
    const videoId = String(form.get("videoId") ?? "");
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw validationError("Pick one of your videos.");
    const rotateHours = Number(form.get("rotateHours") ?? 24);
    const cycles = Number(form.get("cycles") ?? 2);
    if (![24, 48, 72, 168].includes(rotateHours)) throw validationError("Rotation must be 1, 2, 3, or 7 days.");
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 6) throw validationError("Cycles must be 1–6.");
    const labels = form.getAll("labels").map(String);
    const files = await Promise.all(
      form.getAll("files").filter((f): f is File => f instanceof File).map(async (f, i) => ({ label: labels[i] || f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const test = await createTest(caller.workspaceId, caller.user.id, { videoId, videoTitle: String(form.get("videoTitle") ?? ""), rotateHours, cycles, files });
    return NextResponse.json({ data: test }, { status: 201 });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "Storage"));
  }
}
