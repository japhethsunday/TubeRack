"use client";

import { Breadcrumb } from "@/src/components/ui/data";
import { ContentCalendar } from "@/src/components/growth/ContentCalendar";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Content Calendar" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Content Calendar</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">Plan every video from script to publish. Auto-plan a schedule, get reminder emails, and export to Google Calendar or Apple Calendar.</p>
      </div>
      <ContentCalendar />
    </div>
  );
}
