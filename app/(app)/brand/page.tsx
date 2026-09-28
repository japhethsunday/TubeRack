"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, ImageIcon, ListVideo, Sparkles, Upload, Wand2 } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { useSession } from "@/src/components/auth/useSession";
import { generateProviderImage } from "@/src/lib/ai-client";
import { downloadBlob } from "@/src/lib/download";
import { Button } from "@/src/components/ui/Button";
import { LoadingState } from "@/src/components/ui/feedback";
import { bannerJpeg, drawBanner, drawProfile, drawWatermark, loadImg, toBlob } from "@/src/components/brand/art";

interface Brand { name: string; site: string; tagline: string; colors: string[]; logo: string }
interface Pack {
  tagline: string;
  description: string;
  keywords: string;
  playlists: { title: string; description: string }[];
  plan: { day: number; title: string; format: "Short" | "Long"; hook: string; feature: string }[];
  bannerArt: string;
  generatedAt: string;
}
interface Setup { connected: boolean; canManage: boolean; channel: { title?: string } | null }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong.");

function Section({ title, icon: Icon, children, sub }: { title: string; icon: typeof Sparkles; children: React.ReactNode; sub?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold"><Icon className="size-5 text-primary" aria-hidden="true" /> {title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-text">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Owner-only: build and run Recktube's own YouTube channel. */
export default function BrandChannelPage() {
  const session = useSession();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const banner = useRef<HTMLCanvasElement | null>(null);
  const owner = session.status === "signed-in" && session.user.is_owner;

  useEffect(() => {
    if (!owner) return;
    void api.get<{ brand: Brand; pack: Pack | null }>("/api/v1/brand/channel").then((d) => {
      setBrand(d.brand);
      setPack(d.pack);
    }).catch((e) => setMsg({ ok: false, text: errText(e) }));
    void api.get<Setup>("/api/v1/youtube/channel-setup").then(setSetup).catch(() => setSetup(null));
  }, [owner]);

  if (session.status === "loading") return <LoadingState label="Loading" />;
  if (!owner) return <p className="mx-auto max-w-md py-16 text-center text-sm text-muted-text">This page is for the Recktube owner account.</p>;
  if (!brand) return msg ? <p className="text-sm text-destructive">{msg.text}</p> : <LoadingState label="Loading brand kit" />;

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy(null);
  };

  const generatePack = () => run("pack", async () => {
    const d = await api.post<{ pack: Pack }>("/api/v1/brand/channel", { brief });
    setPack(d.pack);
    return "Channel pack ready.";
  });

  const makeBanner = (withArt: boolean) => run(withArt ? "banner-ai" : "banner", async () => {
    const logo = await loadImg(brand.logo);
    let art: HTMLImageElement | null = null;
    if (withArt) {
      const out = await generateProviderImage(pack?.bannerArt || "Wide abstract modern creator studio background, magenta violet and blue glow on near-black, soft light, no text, no logos, calm empty centre", "16:9");
      if (!out.ok) throw new Error(out.message);
      art = await loadImg(out.data.url);
    }
    const c = await drawBanner({ logo, art, name: brand.name, tagline: pack?.tagline || brand.tagline, site: brand.site });
    banner.current = c;
    setBannerUrl(c.toDataURL("image/jpeg", 0.85));
  });

  const saveCanvas = (key: string, make: (logo: HTMLImageElement) => HTMLCanvasElement, name: string) => run(key, async () => {
    const c = make(await loadImg(brand.logo));
    downloadBlob(await toBlob(c, "image/png"), name);
  });

  const canApply = Boolean(setup?.connected && setup.canManage);
  const applyText = () => run("apply-text", async () => {
    if (!pack) return;
    await api.patch("/api/v1/youtube/channel-setup", { description: pack.description, keywords: pack.keywords });
    return "About text and keywords are now on your YouTube channel.";
  });
  const applyPlaylists = () => run("apply-lists", async () => {
    if (!pack) return;
    const r = await api.post<{ created: { title: string }[]; skipped: string[] }>("/api/v1/youtube/playlists", { playlists: pack.playlists.map((p) => ({ ...p, privacy: "public" })) });
    return `Playlists: ${r.created.length} created${r.skipped.length ? `, ${r.skipped.length} already existed` : ""}.`;
  });
  const applyBanner = () => run("apply-banner", async () => {
    if (!banner.current) return;
    const res = await fetch("/api/v1/youtube/banner", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await bannerJpeg(banner.current) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Banner upload failed.");
    return "Banner set on your YouTube channel.";
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Owner</p>
        <h1 className="text-2xl font-bold tracking-tight">Recktube Channel Manager</h1>
        <p className="mt-1 text-sm text-muted-text">Build and run Recktube&apos;s own YouTube channel with the real logo and brand.</p>
      </div>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{msg.text}</p>}

      <Section title="Brand kit" icon={Sparkles}>
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand logo file itself */}
          <img src={brand.logo} alt="Recktube logo" className="size-20 rounded-2xl shadow-lg" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-lg font-bold">{brand.name}</p>
            <p className="text-muted-text">{pack?.tagline || brand.tagline}</p>
            <p className="text-primary">{brand.site.replace(/^https?:\/\//, "")}</p>
          </div>
          <div className="flex gap-1.5">{brand.colors.map((c) => <span key={c} title={c} className="size-8 rounded-full border border-border" style={{ background: c }} />)}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={busy === "profile"} onClick={() => void saveCanvas("profile", drawProfile, "recktube-profile-800.png")}><Download className="size-4" aria-hidden="true" /> Profile picture (800×800)</Button>
          <Button size="sm" variant="outline" loading={busy === "wm"} onClick={() => void saveCanvas("wm", drawWatermark, "recktube-watermark-150.png")}><Download className="size-4" aria-hidden="true" /> Video watermark (150×150)</Button>
        </div>
      </Section>

      <Section title="YouTube banner" icon={ImageIcon} sub="2560×1440 with the logo and text inside the safe area that shows on phones, TVs and desktop.">
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === "banner-ai"} onClick={() => void makeBanner(true)}><Wand2 className="size-4" aria-hidden="true" /> Generate with AI art</Button>
          <Button variant="outline" loading={busy === "banner"} onClick={() => void makeBanner(false)}>Brand gradient version</Button>
        </div>
        {bannerUrl && (
          <div className="mt-4 space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local canvas preview */}
            <img src={bannerUrl} alt="Banner preview" className="w-full rounded-xl border border-border" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => banner.current && void bannerJpeg(banner.current).then((b) => downloadBlob(b, "recktube-youtube-banner.jpg"))}><Download className="size-4" aria-hidden="true" /> Download</Button>
              <Button size="sm" disabled={!canApply} loading={busy === "apply-banner"} onClick={() => void applyBanner()}><Upload className="size-4" aria-hidden="true" /> Set on YouTube</Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Channel pack" icon={ListVideo} sub="About text, keywords, playlists and a 30-day content plan, written from Recktube's real features.">
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} maxLength={600} placeholder="Optional direction, e.g. focus on faceless channel creators" className="w-full rounded-lg border border-border bg-background p-2.5 text-sm" />
        <Button className="mt-2" loading={busy === "pack"} onClick={() => void generatePack()}><Sparkles className="size-4" aria-hidden="true" /> {pack ? "Write a new pack" : "Write channel pack"}</Button>

        {setup && !canApply && (
          <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-muted-text">
            To apply these to YouTube, connect Recktube&apos;s channel with the &quot;manage your channel&quot; permission in <Link href="/youtube" className="font-medium text-primary">My Channel</Link>. (Use a separate channel for Recktube, not your personal one.)
          </p>
        )}

        {pack && (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2"><h3 className="font-semibold">About text</h3><Button size="sm" disabled={!canApply} loading={busy === "apply-text"} onClick={() => void applyText()}>Apply to YouTube</Button></div>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3">{pack.description}</p>
              <p className="mt-2 text-xs text-muted-text"><span className="font-medium text-foreground">Keywords:</span> {pack.keywords}</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2"><h3 className="font-semibold">Playlists</h3><Button size="sm" disabled={!canApply} loading={busy === "apply-lists"} onClick={() => void applyPlaylists()}>Create on YouTube</Button></div>
              <ul className="grid gap-2 sm:grid-cols-2">{pack.playlists.map((p) => <li key={p.title} className="rounded-lg border border-border p-3"><p className="font-medium">{p.title}</p><p className="text-xs text-muted-text">{p.description}</p></li>)}</ul>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">30-day content plan</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {pack.plan.map((p) => (
                  <li key={p.day} className="flex items-start gap-3 p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">D{p.day}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.title}</span>
                      <span className="block text-xs text-muted-text">{p.format} · {p.hook}</span>
                    </span>
                    <Link href={`/admin/promo?${new URLSearchParams({ angle: `${p.title}. Hook: ${p.hook}`, feature: p.feature, format: p.format })}`} className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">Make video</Link>
                  </li>
                ))}
              </ul>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-text"><CheckCircle2 className="size-3.5 text-success" aria-hidden="true" /> Saved {new Date(pack.generatedAt).toLocaleString()}. Videos you make for Recktube aren&apos;t charged credits.</p>
          </div>
        )}
      </Section>
    </div>
  );
}
