import { LoginForm } from "@/app/(auth)/login/form";
import { sanitizeReturnTo } from "@/src/lib/auth/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; reason?: string }>;
}) {
  const { returnTo, reason } = await searchParams;
  return <LoginForm returnTo={sanitizeReturnTo(returnTo)} expired={reason === "expired"} />;
}
