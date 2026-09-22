import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revokeSession, expiredSessionCookie } from "@/src/server/auth";
import { toErrorResponse } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { getSessionUser } from "@/src/server/auth";

/** POST /api/v1/auth/logout — revoke current session, clear cookie. */
export async function POST() {
  try {
    const store = await cookies();
    const token = store.get("tr_session")?.value;
    const user = await getSessionUser();
    if (token) await revokeSession(token);
    const expired = expiredSessionCookie();
    store.set(expired.name, expired.value, expired.options as never);
    if (user) await audit({ userId: user.id, action: "auth.logout", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ data: { loggedOut: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
