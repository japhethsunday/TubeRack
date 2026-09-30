"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { SUPPORT_TOPICS } from "@/src/content/support";

const field = "w-full rounded-xl border border-foreground/10 bg-background px-3.5 py-2.5 text-base text-foreground outline-none transition placeholder:text-foreground/40 focus:border-violet-400/60 focus:shadow-[0_0_0_4px_rgba(139,92,246,0.15)] sm:text-sm";

/** Support page form: sends the message to the team's inbox. */
export function ContactForm() {
  const [f, setF] = useState({ name: "", email: "", topic: SUPPORT_TOPICS[0] as string, message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      await api.post("/api/v1/support/contact", f);
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't send your message. Please email support@recktube.xyz instead.");
      setState("idle");
    }
  }

  if (state === "sent")
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/[0.06] p-8 text-center" role="status">
        <CheckCircle2 className="size-10 text-emerald-500" aria-hidden="true" />
        <p className="text-lg font-semibold">Message sent</p>
        <p className="max-w-sm text-sm text-foreground/70">Thanks, {f.name.split(" ")[0] || "there"}. We&apos;ll reply to <strong>{f.email}</strong>, usually within a day. Check your spam folder if you don&apos;t see it.</p>
      </div>
    );

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-3xl border border-foreground/10 bg-foreground/[0.02] p-5 sm:p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Your name</span>
          <input required maxLength={80} autoComplete="name" value={f.name} onChange={set("name")} className={field} />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Email</span>
          <input required type="email" maxLength={254} autoComplete="email" value={f.email} onChange={set("email")} className={field} placeholder="you@example.com" />
        </label>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">What is it about?</span>
        <select value={f.topic} onChange={set("topic")} className={field}>
          {SUPPORT_TOPICS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Message</span>
        <textarea required minLength={10} maxLength={4000} rows={5} value={f.message} onChange={set("message")} className={field} placeholder="Tell us what happened and, if it's about a video, which project." />
      </label>
      {/* Hidden from people; bots that fill it are ignored. */}
      <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-foreground/50">Please don&apos;t include passwords or card numbers.</p>
        <button type="submit" disabled={state === "sending"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
          {state === "sending" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
          {state === "sending" ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
