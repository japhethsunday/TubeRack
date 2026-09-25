import { NextResponse } from "next/server";
import { requireUser } from "@/src/server/auth";
import { limiterFor } from "@/src/server/rate-limit";
import { rateLimited, toErrorResponse, validationError, BackendError } from "@/src/server/errors";
import { isStockConfigured, searchStock, type StockOrientation } from "@/src/server/stock/pixabay";

/** GET /api/v1/stock/search?kind=video&q=city&orientation=horizontal&page=1 — free stock videos and photos. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limit = limiterFor("read").take(`stock:${user.id}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") === "photo" ? "photo" : "video";
    const query = (url.searchParams.get("q") ?? "").replace(/[^\p{L}\p{N} -]/gu, " ").trim().slice(0, 100);
    if (query.length < 2) throw validationError("Type what you're looking for, e.g. “city at night”.");
    const o = url.searchParams.get("orientation");
    const orientation: StockOrientation = o === "horizontal" || o === "vertical" ? o : "any";
    const page = Math.min(20, Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1));
    if (!isStockConfigured()) throw new BackendError("BACKEND_UNAVAILABLE", "The stock library isn't connected yet.");
    try {
      return NextResponse.json({ data: { items: await searchStock({ kind, query, orientation, page }) } });
    } catch (error) {
      console.error("[stock] search failed:", error instanceof Error ? error.message : error);
      throw new BackendError("BACKEND_UNAVAILABLE", error instanceof Error && /busy/.test(error.message) ? error.message : "The stock library couldn't be reached. Please try again.");
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
