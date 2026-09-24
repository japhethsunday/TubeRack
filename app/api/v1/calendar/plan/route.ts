import { NextResponse } from "next/server";
import { z } from "zod";
import { planCalendar } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { getDb } from "@/src/server/db";
import { addDays } from "@/src/lib/growth/calendar";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 300;

const body = z.object({
  topic: z.string().trim().min(2).max(200),
  audience: z.string().trim().max(150).default(""),
  weeks: z.number().int().min(1).max(8).default(4),
  perWeek: z.number().int().min(1).max(7).default(2),
  publishDays: z.array(z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])).max(7).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** POST /api/v1/calendar/plan — Gemini builds a production schedule and saves it. */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    const { items, model } = await planCalendar(input);
    const db = getDb()!;
    const inserted = [];
    for (const it of items) {
      const rows = await db.unsafe(
        `INSERT INTO calendar_items (workspace_id, user_id, title, kind, date, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [caller.workspaceId, caller.user.id, it.title, it.kind, addDays(input.startDate, it.dayOffset), it.notes],
      );
      inserted.push(rows[0]);
    }
    await recordUsage(caller, { kind: "text", provider: "gemini", model, status: "completed", ref: "calendar-plan" });
    return NextResponse.json({ data: { created: inserted.length } }, { status: 201 });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: "calendar-plan" });
    return toErrorResponse(providerFailure(error, "The generation service"));
  }
}
