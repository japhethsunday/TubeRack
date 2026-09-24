import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { deleteConnection, FORCE_SSL_SCOPE, getConnection, hasScope, isOAuthConfigured, channelOnOtherAccount } from "@/src/server/google/oauth";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/youtube/connection — connection status for the workspace. */
export async function GET() {
  try {
    const { workspaceId, user } = await requireWorkspace("viewer");
    const connection = await getConnection(workspaceId);
    // Same channel on another TubeRack login = the owner's work is split.
    const splitAccount = connection ? await channelOnOtherAccount(connection.channelId, user.id).catch(() => false) : false;
    return NextResponse.json({ data: { configured: isOAuthConfigured(), connection, canManage: hasScope(connection, FORCE_SSL_SCOPE), splitAccount } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/youtube/connection — revoke Google access and forget the tokens. */
export async function DELETE() {
  try {
    const { workspaceId } = await requireWorkspace("editor");
    await deleteConnection(workspaceId);
    return NextResponse.json({ data: { disconnected: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
