import { LoginForm } from "@/app/(auth)/login/form";
import { sanitizeReturnTo } from "@/src/lib/auth/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; reason?: string; error?: string }>;
}) {
  const { returnTo, reason, error } = await searchParams;
  return <LoginForm returnTo={sanitizeReturnTo(returnTo)} expired={reason === "expired"} externalError={error?.slice(0, 200)} />;
}
