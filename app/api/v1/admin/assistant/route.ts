import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRole, requireAdmin } from "@/src/server/admin";
import { getSessionUser } from "@/src/server/auth";
import { askAssistant, verifyProposal } from "@/src/server/admin-agent/agent";
import { runAction } from "@/src/server/admin-agent/actions";
import { sharedLimit } from "@/src/server/shared-limit";
import { forbidden, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ask = z.object({
  history: z
    .array(z.object({ role: z.enum(["admin", "assistant"]), text: z.string().max(6000) }))
    .min(1)
    .max(30),
});

/** POST /api/v1/admin/assistant — ask the admin assistant (look-ups + proposed actions). */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "overview");
    const role = await adminRole(admin);
    if (!role) throw forbidden("Admins only.");
    await sharedLimit(`admin-agent:${admin.id}`, 120, 3600);
    const { history } = await parseBody(request, ask);
    if (history[history.length - 1].role !== "admin") throw validationError("Ask a question first.");
    return NextResponse.json({ data: await askAssistant(admin.id, role, history) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const confirm = z.object({ token: z.string().min(10).max(6000) });

/** PUT /api/v1/admin/assistant — confirm one proposed action (signed, single use, role re-checked). */
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request, "overview");
    const user = await getSessionUser();
    const role = await adminRole(user);
    if (!role || !user || user.id !== admin.id) throw forbidden("Admins only.");
    const { token } = await parseBody(request, confirm);
    const p = verifyProposal(token, admin.id);
    if (!p) throw validationError("This action has expired or isn't valid. Ask the assistant again.");
    // Single use: a confirmed card can't be replayed.
    await sharedLimit(`admin-agent-token:${p.nonce}`, 1, 20 * 60).catch(() => {
      throw validationError("This action was already done.");
    });
    return NextResponse.json({ data: { result: await runAction(admin, role, p.action, p.args) } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
