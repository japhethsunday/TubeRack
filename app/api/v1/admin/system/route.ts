import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/server/admin";
import { runDaily } from "@/src/server/growth/daily";
import { sendEmail } from "@/src/server/email";
import { renderEmail } from "@/src/server/email-templates";
import { getServerEnv } from "@/src/lib/env";
import { audit } from "@/src/server/audit";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { cloudflareGenerateImage, cloudflareGenerateText, isCloudflareAiConfigured } from "@/src/server/ai/cloudflare";

export const maxDuration = 300;

const body = z.object({ action: z.enum(["run-daily", "test-email", "test-cloudflare-ai"]) });

/** POST /api/v1/admin/system — maintenance: run the daily job now, or send a test email to yourself. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request, "system");
    const { action } = await parseBody(request, body);
    if (action === "run-daily") {
      const result = await runDaily();
      await audit({ userId: admin.id, action: "admin.system.run-daily", metadata: { result: JSON.stringify(result).slice(0, 400) } });
      return NextResponse.json({ data: result });
    }
    if (action === "test-cloudflare-ai") {
      if (!isCloudflareAiConfigured()) return NextResponse.json({ data: { ok: false, error: "CF_AI_TOKEN isn't set." } });
      const msg = (e: unknown) => (e instanceof Error ? e.message.slice(0, 300) : "failed");
      const t0 = Date.now();
      const text = await cloudflareGenerateText({ prompt: "Reply with one short sentence confirming you are working.", maxTokens: 60 }, { budgetMs: 60_000 })
        .then((r) => ({ ok: true, model: r.model, reply: r.text.slice(0, 200), ms: Date.now() - t0 }))
        .catch((e) => ({ ok: false, error: msg(e) }));
      const t1 = Date.now();
      const image = await cloudflareGenerateImage("A calm mountain lake at sunrise, photo", "16:9")
        .then((r) => ({ ok: true, model: r.model, kb: Math.round((r.dataUrl.length * 3) / 4 / 1024), ms: Date.now() - t1 }))
        .catch((e) => ({ ok: false, error: msg(e) }));
      return NextResponse.json({ data: { text, image } });
    }
    const app = getServerEnv().APP_URL.replace(/\/$/, "");
    const mail = renderEmail({
      preheader: "Your email setup is working.",
      eyebrow: "Test email",
      heading: "Email is working",
      intro: "This test was sent from the Recktube admin console. If it arrived in your inbox with the Recktube logo, sending is set up correctly.",
      cta: { label: "Open admin", url: `${app}/admin` },
      reason: "You sent this test from the admin console.",
      appUrl: app,
    });
    const res = await sendEmail({ to: admin.email, subject: "Recktube test email", kind: "alert", ...mail });
    await audit({ userId: admin.id, action: "admin.system.test-email", metadata: { sent: res.sent } });
    return NextResponse.json({ data: res });
  } catch (error) {
    return toErrorResponse(error);
  }
}
