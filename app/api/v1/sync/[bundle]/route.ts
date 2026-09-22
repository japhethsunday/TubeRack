import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { syncPut, syncGet } from "@/src/server/sync";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { SYNC_SCHEMAS, type SyncKind } from "@/src/lib/sync-map";

const KINDS = Object.keys(SYNC_SCHEMAS) as SyncKind[];

function kindFrom(request: Request): SyncKind {
  const kind = new URL(request.url).pathname.split("/").pop() ?? "";
  if (!(KINDS as string[]).includes(kind)) throw validationError(`Unknown sync scope. Expected one of: ${KINDS.join(", ")}.`);
  return kind as SyncKind;
}

/** GET /api/v1/sync/:bundle — assemble server state into frontend shapes. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const kind = kindFrom(request);
    const data = await syncGet(kind, user);
    return NextResponse.json({ data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PUT /api/v1/sync/:bundle — validated merge with tombstones. */
export async function PUT(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const kind = kindFrom(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw validationError("Request body must be valid JSON.");
    }
    const result = await syncPut(kind, user, body);
    return NextResponse.json({ data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
