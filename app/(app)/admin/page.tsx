import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/src/server/auth";
import { isAdmin } from "@/src/server/admin";
import { AdminDashboard } from "@/src/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Recktube", robots: { index: false, follow: false } };

/** Owner-only control room. Anyone else gets the normal 404 page. */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();
  return <AdminDashboard adminEmail={user!.email} />;
}
