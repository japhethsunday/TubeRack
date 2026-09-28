"use client";

import { useCallback, useEffect, useState } from "react";
import { Clapperboard, Copy, ExternalLink, Film, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { Loading, PageTitle, Panel, errorText, when } from "@/src/components/admin/kit";

interface Scene { durationSec: number; visual: string; onScreenText: string; narration: string }
interface Pkg { title: string; hook: string; voiceover: string; scenes: Scene[]; cta: string; thumbnailText: string; captions: { platform: string; title: string; caption: string; hashtags: string[] }[] }
interface Promo { id: string; feature: string; style: string; platform: string; lengthSec: number; pkg: Pkg; projectId: string | null; createdAt: string }
interface Data { options: { features: { id: string; name: string; pitch: string }[]; styles: string[]; platforms: string[] }; promos: Promo[] }

const select = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); })}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-text hover:bg-muted hover:text-foreground"
    >
      <Copy className="size-3" /> {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function AdminPromo() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ feature: "overview", style: "Problem → solution", platform: "YouTube Shorts", lengthSec: 30, angle: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Data>("/api/v1/admin/promo"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load from the backend on first view.
    void load();
  }, [load]);

  async function write() {
    setBusy("write");
    setMsg(null);
    try {
      const p = await api.post<Promo>("/api/v1/admin/promo", form);
      await load();
      setOpenId(p.id);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(null);
  }

  async function makeProject(p: Promo) {
    setBusy(p.id);
    setMsg(null);
    try {
      const r = await api.post<{ projectId: string }>(`/api/v1/admin/promo/${p.id}`, { action: "project" });
      await load();
      setMsg({ ok: true, text: "Project created in your studio — generate the voice-over and visuals, then export in Video Studio." });
      window.open(`/studio/script?project=${encodeURIComponent(r.projectId)}`, "_blank", "noopener");
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(null);
  }

  async function remove(p: Promo) {
    if (!window.confirm("Delete this promo? (A studio project made from it stays.)")) return;
    await api.remove(`/api/v1/admin/promo/${p.id}`).catch(() => null);
    await load();
  }

  const open = data?.promos.find((p) => p.id === openId) ?? null;
  const feature = (id: string) => data?.options.features.find((f) => f.id === id)?.name ?? id;

  return (
    <>
      <PageTitle title="Promo videos" sub="Short vertical ads for Recktube, made with Recktube. The AI writes the whole video; one click turns it into a studio project you produce and export." />
      {!data ? <Loading error={error} onRetry={() => void load()} /> : (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Panel title="New promo">
              <div className="space-y-3 text-sm">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-text">What to promote</span>
                  <select className={select} value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value })}>
                    {data.options.features.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <span className="block text-[11px] text-muted-text">{data.options.features.find((f) => f.id === form.feature)?.pitch}</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1"><span className="text-xs text-muted-text">Style</span>
                    <select className={select} value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>{data.options.styles.map((s) => <option key={s}>{s}</option>)}</select>
                  </label>
                  <label className="block space-y-1"><span className="text-xs text-muted-text">Platform</span>
                    <select className={select} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>{data.options.platforms.map((s) => <option key={s}>{s}</option>)}</select>
                  </label>
                </div>
                <label className="block space-y-1"><span className="text-xs text-muted-text">Length: {form.lengthSec}s</span>
                  <input type="range" min={15} max={60} step={5} value={form.lengthSec} onChange={(e) => setForm({ ...form, lengthSec: Number(e.target.value) })} className="w-full accent-primary" />
                </label>
                <label className="block space-y-1"><span className="text-xs text-muted-text">Angle (optional)</span>
                  <textarea rows={2} value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} maxLength={600} placeholder="e.g. aim at faceless channel creators who struggle with ideas" className="w-full rounded-lg border border-border bg-background px-2.5 py-2" />
                </label>
                <Button className="w-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white" loading={busy === "write"} onClick={() => void write()}>
                  <Sparkles className="size-4" /> {busy === "write" ? "Writing the video…" : "Write promo video"}
                </Button>
                {msg && <p className={cx("text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
              </div>
            </Panel>
            <Panel title="Your promos">
              {data.promos.length === 0 ? <p className="py-6 text-center text-sm text-muted-text"><Film className="mx-auto mb-2 size-8 opacity-50" />None yet.</p> : (
                <ul className="-m-4 divide-y divide-border">
                  {data.promos.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => setOpenId(p.id)} className={cx("w-full px-4 py-3 text-left", openId === p.id ? "bg-primary/10" : "hover:bg-muted")}>
                        <span className="block truncate text-sm font-semibold">{p.pkg.title}</span>
                        <span className="block text-xs text-muted-text">{feature(p.feature)} · {p.platform} · {p.lengthSec}s · {when(p.createdAt)}{p.projectId ? " · in studio" : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div>
            {!open ? (
              <Panel><p className="py-16 text-center text-sm text-muted-text">Write a promo, or choose one to see its script, scenes and captions.</p></Panel>
            ) : (
              <div className="space-y-4">
                <Panel
                  title={open.pkg.title}
                  right={<Button size="sm" variant="ghost" onClick={() => void remove(open)}><Trash2 className="size-4" /></Button>}
                >
                  <div className="space-y-3 text-sm">
                    <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-text">Hook</span><br />{open.pkg.hook}</p>
                    <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-text">Call to action</span><br />{open.pkg.cta}</p>
                    <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-text">Cover text</span><br />{open.pkg.thumbnailText}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {open.projectId ? (
                        <>
                          <a href={`/studio/script?project=${encodeURIComponent(open.projectId)}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted"><ExternalLink className="size-4" /> Open script</a>
                          <a href={`/studio/video?project=${encodeURIComponent(open.projectId)}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm text-primary-foreground hover:opacity-90"><Clapperboard className="size-4" /> Open in Video Studio</a>
                        </>
                      ) : (
                        <Button loading={busy === open.id} onClick={() => void makeProject(open)}><Clapperboard className="size-4" /> Create project in my studio</Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-text">In the studio: generate the voice-over from the script, add visuals per scene (screen recordings of Recktube work best), captions and music, then export 9:16 and post it.</p>
                  </div>
                </Panel>
                <Panel title={`Scenes · ${open.pkg.scenes.reduce((a, s) => a + s.durationSec, 0)}s`} right={<CopyBtn text={open.pkg.voiceover} />}>
                  <ol className="space-y-3">
                    {open.pkg.scenes.map((s, i) => (
                      <li key={i} className="rounded-lg border border-border p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-text"><span className="font-semibold">Scene {i + 1}</span><span>{s.durationSec}s</span></div>
                        {s.onScreenText && <p className="mb-1 inline-block rounded bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{s.onScreenText}</p>}
                        <p><span className="text-muted-text">Show:</span> {s.visual}</p>
                        <p className="mt-1"><span className="text-muted-text">Say:</span> “{s.narration}”</p>
                      </li>
                    ))}
                  </ol>
                </Panel>
                <Panel title="Captions & hashtags">
                  <div className="space-y-3">
                    {open.pkg.captions.map((c) => {
                      const full = `${c.title}\n\n${c.caption}\n\n${c.hashtags.join(" ")}`;
                      return (
                        <div key={c.platform} className="rounded-lg border border-border p-3 text-sm">
                          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold">{c.platform}</span><CopyBtn text={full} /></div>
                          <p className="font-medium">{c.title}</p>
                          <p className="mt-1 whitespace-pre-wrap text-muted-text">{c.caption}</p>
                          <p className="mt-1 text-xs text-primary">{c.hashtags.join(" ")}</p>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
