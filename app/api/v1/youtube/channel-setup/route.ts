import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/src/server/workspace";
import { FORCE_SSL_SCOPE, getConnection, hasScope, isOAuthConfigured } from "@/src/server/google/oauth";
import { myChannel, updateChannelBranding } from "@/src/server/google/channel";
import { providerFailure } from "@/src/server/ai/guard";
import { getDb } from "@/src/server/db";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";
import { sharedLimit } from "@/src/server/shared-limit";

/** Steps YouTube's API does not allow, with the exact place to do them. */
function manualSteps(channelId: string | null) {
  const studio = channelId ? `https://studio.youtube.com/channel/${channelId}/editing/profile` : "https://studio.youtube.com";
  return [
    { id: "create", label: "Create the channel", how: "YouTube's API cannot create channels. Open youtube.com/create_channel, create the channel (or a brand account channel), then connect it here.", url: "https://www.youtube.com/create_channel" },
    { id: "name", label: "Set the channel name", how: "The API cannot rename a channel. In YouTube Studio → Customisation → Basic info, paste the chosen name and publish.", url: studio },
    { id: "handle", label: "Claim the handle", how: "Handles can only be set in YouTube Studio → Customisation → Basic info → Handle. Pick one marked available here — availability can change until you claim it.", url: studio },
    { id: "picture", label: "Upload the profile picture", how: "The API cannot change the profile picture. In YouTube Studio → Customisation → Branding → Picture, upload a 800×800 image.", url: channelId ? `https://studio.youtube.com/channel/${channelId}/editing/images` : "https://studio.youtube.com" },
    { id: "verify", label: "Verify the account", how: "Phone verification unlocks custom thumbnails and videos over 15 minutes.", url: "https://www.youtube.com/verify" },
  ];
}

/** GET /api/v1/youtube/channel-setup — connected channel settings + what can be automated. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const conn = await getConnection(workspaceId);
    if (!conn) {
      return NextResponse.json({ data: { configured: isOAuthConfigured(), connected: false, canManage: false, channel: null, manual: manualSteps(null) } });
    }
    const canManage = hasScope(conn, FORCE_SSL_SCOPE);
    const channel = await myChannel(workspaceId);
    return NextResponse.json({ data: { configured: true, connected: true, canManage, channel, manual: manualSteps(channel.id) } });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}

const patchBody = z.object({
  description: z.string().max(1000).optional(),
  keywords: z.string().max(500).optional(),
  country: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).optional(),
  defaultLanguage: z.string().trim().max(10).optional(),
  planId: z.string().max(64).optional(),
});

/** PATCH /api/v1/youtube/channel-setup — write About text, keywords, country, language to YouTube. */
export async function PATCH(request: Request) {
  try {
    const { workspaceId, user } = await requireWorkspace("editor");
    await sharedLimit(`yt-setup:${user.id}`, 30, 3600);
    const body = await parseBody(request, patchBody);
    const conn = await getConnection(workspaceId);
    if (!conn) throw validationError("Connect your YouTube channel first.");
    if (!hasScope(conn, FORCE_SSL_SCOPE)) throw validationError("Grant the “manage your channel” permission first (Reconnect with permission).");
    const { planId, ...patch } = body;
    const channel = await updateChannelBranding(workspaceId, patch);
    if (planId) {
      const db = getDb();
      await db?.unsafe(
        `UPDATE channel_plans SET applied = applied || $3::jsonb, updated_at = now() WHERE id = $1 AND workspace_id = $2`,
        [planId, workspaceId, { branding: { at: new Date().toISOString(), fields: Object.keys(patch), channelId: channel.id } } as never],
      );
    }
    return NextResponse.json({ data: channel });
  } catch (error) {
    return toErrorResponse(providerFailure(error, "YouTube"));
  }
}
