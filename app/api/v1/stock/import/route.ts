import { NextResponse } from "next/server";
import { sharedLimit } from "@/src/server/shared-limit";
import { z } from "zod";
import { guardProviderCall, storeGenerated } from "@/src/server/ai/guard";
import { toErrorResponse, BackendError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { downloadStock } from "@/src/server/stock/pixabay";

export const maxDuration = 120;

const body = z.object({ id: z.string().regex(/^[vp]\d{1,12}$/, "Unknown stock item.") });

/** POST /api/v1/stock/import — copy a stock video/photo into the workspace's storage. */
export async function POST(request: Request) {
  try {
    const caller = await guardProviderCall();
    // Each import stores a file: cap per user per day.
    await sharedLimit(`stock-import:${caller.user.id}`, 150, 86400);
    const { id } = await parseBody(request, body);
    let file;
    try {
      file = await downloadStock(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new BackendError("BACKEND_UNAVAILABLE", /available|large|empty|busy|set up/i.test(message) ? message : "Couldn't fetch this item right now. Please try another one.");
    }
    const url = await storeGenerated(caller, file.bytes, file.mime, file.ext);
    if (!url) throw new BackendError("BACKEND_UNAVAILABLE", "File storage isn't available right now.");
    return NextResponse.json({ data: { url, mime: file.mime, fileSize: file.bytes.byteLength, item: file.item } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
