import { ForgotFlow } from "@/app/(auth)/forgot-password/form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; step?: string }> }) {
  const { email, step } = await searchParams;
  return <ForgotFlow initialEmail={(email ?? "").slice(0, 254)} startAtCode={step === "code" && Boolean(email)} />;
}
