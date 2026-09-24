"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const HOME = "/dashboard";
const VISITED = "tuberack:nav-stack";

function readStack(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(VISITED) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(VISITED, JSON.stringify(stack.slice(-50)));
  } catch {
    // storage unavailable: Back falls back to the parent route
  }
}

/** Where "Back" goes when there is no in-app history (opened from a link or a new tab). */
export function parentOf(pathname: string, project: string | null): string {
  if (pathname.startsWith("/studio/")) return project ? `/projects/${project}` : "/projects";
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length > 1) return `/${parts.slice(0, -1).join("/")}`;
  return HOME;
}

/** Back to the previous page in the app, or up one level when there is none. */
export function BackButton() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  // Remember the in-app pages visited in this tab so Back never leaves the app.
  useEffect(() => {
    const stack = readStack();
    if (stack[stack.length - 1] === pathname) return;
    if (stack[stack.length - 2] === pathname) stack.pop();
    else stack.push(pathname);
    writeStack(stack);
  }, [pathname]);

  if (pathname === HOME) return null;

  function goBack() {
    const stack = readStack();
    if (stack.length > 1 && stack[stack.length - 1] === pathname) {
      router.back();
    } else {
      router.push(parentOf(pathname, params.get("project")));
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm text-muted-text transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Back
    </button>
  );
}
