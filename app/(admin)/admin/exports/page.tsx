"use client";

import { Download } from "lucide-react";
import { PageTitle } from "@/src/components/admin/kit";

const FILES = [
  { kind: "users", title: "Users", body: "Email, name, status, verified, marketing consent, sign-up source, join date, credit balance and plan." },
  { kind: "credits", title: "Credit transactions", body: "Every refill, spend, admin add/remove, reset and bonus — for accounting." },
  { kind: "usage", title: "Generations", body: "Every generation: who, which tool, success or failure, provider." },
];

export default function AdminExports() {
  return (
    <>
      <PageTitle title="Data export" sub="Download spreadsheets (CSV) for reports and accounting. Every download is recorded in the security log." />
      <ul className="grid gap-3 sm:grid-cols-3">
        {FILES.map((f) => (
          <li key={f.kind}>
            <a href={`/api/v1/admin/exports?kind=${f.kind}`} className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 hover:border-primary/50 active:scale-[0.99]">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary"><Download className="size-5" aria-hidden="true" /></span>
              <span className="font-semibold">{f.title}</span>
              <span className="text-xs text-muted-text">{f.body}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
