import Link from "next/link";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { ErrorState } from "@/src/components/ui/states";
import { authError } from "@/src/lib/auth/errors";
import { ResetForm } from "@/app/(auth)/reset-password/form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; expired?: string }>;
}) {
  const { token, expired } = await searchParams;

  if (!token) {
    const content = authError("invalid-token");
    return (
      <AuthLayout title="Reset your password" subtitle="Choose a new password.">
        <ErrorState
          title={content.title}
          body={content.body}
          recoveryHref="/forgot-password"
          recoveryLabel="Request a new link"
        />
        <p className="mt-3 text-center text-xs text-muted-text">
          Demonstrating states?{" "}
          <Link href="/reset-password?expired=1" className="underline">
            Preview the expired-link state
          </Link>
        </p>
      </AuthLayout>
    );
  }
  return <ResetForm token={token} expired={expired === "1"} />;
}
