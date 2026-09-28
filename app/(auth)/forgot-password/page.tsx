import { ForgotFlow } from "@/app/(auth)/forgot-password/form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return <ForgotFlow initialEmail={(email ?? "").slice(0, 254)} />;
}
