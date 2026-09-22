import { VerifyForm } from "@/app/(auth)/verify-email/form";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; preview?: string }>;
}) {
  const { token, preview } = await searchParams;
  return <VerifyForm token={token} preview={preview === "success"} />;
}
