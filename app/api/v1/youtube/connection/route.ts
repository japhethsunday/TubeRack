import { NextResponse } from "next/server";
import { requireWorkspace } from "@/src/server/workspace";
import { deleteConnection, getConnection, isOAuthConfigured } from "@/src/server/google/oauth";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/youtube/connection — connection status for the workspace. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const connection = await getConnection(workspaceId);
    return NextResponse.json({ data: { configured: isOAuthConfigured(), connection } });
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
