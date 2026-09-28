import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/src/server/auth";
import { adminRole } from "@/src/server/admin";
import { AdminShell } from "@/src/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recktube Admin", robots: { index: false, follow: false } };

/** Owner-only admin console, separate from the creator app. Everyone else gets a 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const role = await adminRole(user);
  if (!role) notFound();
  return <AdminShell email={user!.email} role={role}>{children}</AdminShell>;
}
