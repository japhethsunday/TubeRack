"use client";

import { useEffect, useState } from "react";
import { Mic, Plus } from "lucide-react";
import { providerById, capabilityBlock, PROVIDERS } from "@/src/lib/media/providers";
import { listSystemVoices, speakText } from "@/src/lib/media/audio";
import { useMedia, runLocalJob, MediaStorageNote } from "@/src/components/media/MediaProvider";
import { SpeechPreview, FilePreview } from "@/src/components/media/players";
import { synthesizeProviderSpeech } from "@/src/lib/ai-client";
import { Select, Input, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Alert } from "@/src/components/ui/Alert";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { countWords, estimateSeconds } from "@/src/lib/script/measure";
import { AssetDownload } from "@/src/components/media/AssetDownload";

/** Matches the server limit: ~15 minutes of narration per take. */
const MAX_TAKE_CHARS = 14_000;

export interface TextSource {
  id: string;
  label: string;
  text: string;
}

/**
 * Voice studio: system-TTS previews, persistent voice profiles
 * (Voice Profile → provider mapping resolves in Phase 11), saved takes
 * with versions, scene assignment.
 */
export function VoiceStudio({
  projectId,
  sources,
  registerRerun,
  initialSourceId,
}: {
  projectId: string;
  sources: TextSource[];
  registerRerun: (assetId: string, fn: () => void) => void;
  initialSourceId?: string;
}) {
  const { voicesFor, defaultVoiceFor, saveVoice, removeVoice, addAsset, updateAsset, assetsFor } = useMedia();
  const [provider, setProvider] = useState("ai-provider");
  const [profileId, setProfileId] = useState<string>("");
  const [profileName, setProfileName] = useState("Narrator A");
  const [language, setLanguage] = useState("en-US");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [systemVoice, setSystemVoice] = useState("");
  const [providerVoice, setProviderVoice] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [sourceId, setSourceId] = useState(initialSourceId && (initialSourceId === "custom" || sources.some((s) => s.id === initialSourceId)) ? initialSourceId : (sources[0]?.id ?? "custom"));
  const [customText, setCustomText] = useState("");
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [running, setRunning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const profiles = voicesFor(projectId);
  const profile = profiles.find((p) => p.id === profileId) ?? defaultVoiceFor(projectId) ?? profiles[0] ?? null;
  const block = capabilityBlock(provider, "tts");

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setSystemVoices(listSystemVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const source = sources.find((s) => s.id === sourceId);
  const text = sourceId === "custom" ? customText : (source?.text ?? "");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const estSec = estimateSeconds(Math.max(1, words), Math.round(150 * rate));
  const takes = assetsFor(projectId).filter(
    (a) => a.kind === "voice" && (a.source === "local-draft" || a.source === "provider-output"),
  );
  const isGemini = provider === "ai-provider";
  const [genError, setGenError] = useState<string | null>(null);

  function currentSettings() {
    return {
      voiceName: profile?.systemVoice || systemVoice,
      rate: profile?.rate ?? rate,
      pitch: profile?.pitch ?? pitch,
      lang: profile?.language ?? language,
    };
  }

  function saveProfile() {
    const saved = saveVoice({
      id: profile?.id,
      projectId,
      name: profileName.trim() || "Narrator",
      language,
      rate,
      pitch,
      systemVoice,
      providerVoice: providerVoice.trim(),
      isDefault: makeDefault,
    });
    setProfileId(saved.id);
  }

  const providerVoiceName = GEMINI_VOICES.includes(providerVoice) ? providerVoice : "Kore";

  /**
   * Generated narration: real audio stored server-side and saved as a take.
   * Long text is voiced in full (the server splits and joins it); the take's
   * length is the real audio length, so nothing is trimmed on the timeline.
   */
  async function generateTake(body: string, label: string, sceneIds: string[]): Promise<boolean> {
    const words = countWords(body);
    const asset = addAsset({
      projectId,
      sceneIds,
      kind: "voice",
      source: "provider-output",
      status: "generating",
      title: `Voice take — ${label.slice(0, 40)}`,
      payload: "",
      mime: "audio/wav",
      durationSec: estimateSeconds(Math.max(1, words), 150),
      tags: ["take", "generated", providerVoiceName],
      approval: "draft",
    });
    registerRerun(asset.id, () => void generateTake(body, label, sceneIds));
    const outcome = await synthesizeProviderSpeech(body, providerVoiceName);
    if (outcome.ok) {
      updateAsset(asset.id, {
        status: "ready",
        payload: outcome.data.url,
        mime: outcome.data.mimeType,
        ...(outcome.data.durationSec ? { durationSec: outcome.data.durationSec } : {}),
      });
      return true;
    }
    updateAsset(asset.id, { status: "failed", error: outcome.message });
    setGenError(outcome.message);
    return false;
  }

  async function saveGeminiTake() {
    setRunning(true);
    setGenError(null);
    const sceneIds = sourceId.startsWith("scn-") ? [sourceId.slice(4)] : [];
    await generateTake(text.trim().slice(0, MAX_TAKE_CHARS), source?.label ?? "custom", sceneIds);
    setRunning(false);
  }

  const sceneSources = sources.filter((s) => s.id.startsWith("scn-") && s.text.trim());
  /**
   * Voice every scene as ONE take: scene narration in order, voiced in a
   * single pass (the server splits and joins long text), attached to all
   * scenes. Longer than one take allows? Falls back to one take per scene.
   */
  async function voiceAllScenes() {
    if (sceneSources.length === 0) return;
    setRunning(true);
    setGenError(null);
    const combined = sceneSources.map((s) => s.text.trim()).join("\n\n");
    const ids = sceneSources.map((s) => s.id.slice(4));
    if (combined.length <= MAX_TAKE_CHARS) {
      await generateTake(combined, `All ${sceneSources.length} scenes`, ids);
    } else {
      // Too long for one file: split into as few takes as possible, in order.
      let group: typeof sceneSources = [];
      let len = 0;
      const flush = async () => {
        if (!group.length) return;
        const first = group[0].label.split(":")[0];
        const last = group[group.length - 1].label.split(":")[0];
        await generateTake(group.map((g) => g.text.trim()).join("\n\n"), group.length > 1 ? `${first}–${last}` : group[0].label, group.map((g) => g.id.slice(4)));
        group = [];
        len = 0;
      };
      for (const s of sceneSources) {
        const t = s.text.trim().slice(0, MAX_TAKE_CHARS);
        if (len + t.length + 2 > MAX_TAKE_CHARS) await flush();
        group.push(s);
        len += t.length + 2;
      }
      await flush();
    }
    setRunning(false);
  }

  function saveTake() {
    if (!text.trim() || block) return;
    if (isGemini) {
      void saveGeminiTake();
      return;
    }
    const settings = currentSettings();
    const flag = { cancelled: false };
    setRunning(true);
    const asset = addAsset({
      projectId,
      sceneIds: [],
      kind: "voice",
      source: "local-draft",
      status: "pending",
      title: `Take — ${(source?.label ?? "custom").slice(0, 40)}`,
      payload: JSON.stringify({ text: text.trim().slice(0, MAX_TAKE_CHARS), ...settings }),
      mime: "application/x-tuberack-voice",
      durationSec: estSec,
      tags: ["take", profile?.name ?? "default"],
      approval: "draft",
    });
    registerRerun(asset.id, () => saveTake());
    void runLocalJob(
      (status) => updateAsset(asset.id, { status }),
      [
        { label: "prepare", work: () => undefined },
        {
          label: "synthesize",
          work: () => {
            speakText(text.trim().slice(0, 2000), settings);
          },
        },
      ],
      () => flag.cancelled,
    ).then((ok) => {
      updateAsset(asset.id, { status: ok ? "ready" : "cancelled" });
      setRunning(false);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        {block && <Alert tone="warn" title="Voice provider not connected">{block}</Alert>}

        <section aria-label="Voice profile">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mic className="size-4 text-muted-text" aria-hidden="true" />
            Project voice
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Input label="Profile name" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            <Select label="Use profile" value={profile?.id ?? ""} onChange={(e) => {
              const p = profiles.find((x) => x.id === e.target.value);
              setProfileId(e.target.value);
              if (p) {
                setProfileName(p.name);
                setLanguage(p.language);
                setRate(p.rate);
                setPitch(p.pitch);
                setSystemVoice(p.systemVoice);
                setProviderVoice(p.providerVoice);
              }
            }}>
              <option value="">Current settings</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (default)" : ""}</option>
              ))}
            </Select>
            <Select label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "yo-NG", "ha-NG", "ig-NG"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
            <Select label="System voice (this device)" value={systemVoice} onChange={(e) => setSystemVoice(e.target.value)} hint="Voices vary by device and browser.">
              <option value="">Auto</option>
              {systemVoices.map((v) => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              Rate
              <input type="range" min={0.5} max={1.5} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Speaking rate" className="flex-1" />
              <span className="w-8 text-xs tabular-nums">{rate.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              Pitch
              <input type="range" min={0.5} max={1.5} step={0.05} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} aria-label="Pitch" className="flex-1" />
              <span className="w-8 text-xs tabular-nums">{pitch.toFixed(2)}</span>
            </label>
          </div>
          <Select label="Voice" value={GEMINI_VOICES.includes(providerVoice) ? providerVoice : "Kore"} onChange={(e) => setProviderVoice(e.target.value)} hint="Used for generated narration.">
            {GEMINI_VOICES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={saveProfile}>
              <Plus className="size-4" aria-hidden="true" />
              Save profile
            </Button>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="size-4" />
              Project default — future scenes inherit it
            </label>
          </div>
          {profiles.length > 0 && (
            <ul className="mt-3 space-y-1" aria-label="Saved voice profiles">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                  <span>
                    {p.name} <span className="text-xs text-muted-text">{p.language} · {p.rate}× · {p.pitch}×</span>{" "}
                    {p.isDefault && <Badge tone="ok">Default</Badge>}
                  </span>
                  {confirmDelete === p.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      <button type="button" onClick={() => { removeVoice(p.id); setConfirmDelete(null); }} className="font-medium text-destructive underline">Yes</button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="text-muted-text underline">Keep</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(p.id)} className="text-xs text-muted-text underline">Delete</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Take text">
          <h3 className="text-sm font-semibold">Take text</h3>
          <div className="mt-2 grid gap-3">
            <Select label="Source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="custom">Custom text</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.label} ({countWords(s.text)}w)</option>
              ))}
            </Select>
            {sourceId === "custom" && (
              <Textarea label="Custom text" rows={4} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Paste narration…" />
            )}
            {sourceId !== "custom" && (
              <p className="max-h-28 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm text-muted-text">{source?.text.slice(0, 500)}</p>
            )}
            <p className="text-xs text-muted-text" aria-live="polite">
              {words} words · ~{estSec}s at current rate. Provider: {providerById(provider).label}.
            </p>
            <Button onClick={saveTake} disabled={!text.trim() || running || Boolean(block)}>
              <Mic className="size-4" aria-hidden="true" />
              {running ? "Generating voice-over…" : isGemini ? "Generate voice-over" : "Preview + save take"}
            </Button>
            {isGemini && sceneSources.length > 1 && (
              <Button variant="outline" onClick={() => void voiceAllScenes()} disabled={running || Boolean(block)}>
                <Mic className="size-4" aria-hidden="true" />
                {running ? "Voicing all scenes…" : `Voice all ${sceneSources.length} scenes as one take`}
              </Button>
            )}
            {text.trim().length > MAX_TAKE_CHARS && (
              <p className="text-xs text-warning">This text is longer than one take allows (~15 min). Use “Voice all scenes” — it splits it into as few takes as possible.</p>
            )}
            {genError && (
              <Alert tone="warn" title="Voice could not be generated">
                {genError}
              </Alert>
            )}
          </div>
        </section>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Takes ({takes.length})</h3>
        {takes.length === 0 ? (
          <EmptyState title="No takes yet" body="Takes are versioned automatically — regenerate freely, approve explicitly, assign to scenes from the Library." />
        ) : (
          <ul className="space-y-2" aria-label="Saved takes">
            {takes.slice(0, 8).map((t) => (
              <li key={t.id} className="rounded-xl border border-border bg-surface p-3">
                <p className="truncate text-sm font-medium">{t.title}</p>
                <div className="mt-2">
                  {t.source === "provider-output" ? (
                    t.status === "ready" ? (
                      <div className="space-y-2">
                        <FilePreview url={t.payload} mime={t.mime} label={t.title} />
                        <AssetDownload asset={t} />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-text">{t.status === "failed" ? `Failed: ${t.error ?? "unknown error"}` : "Generating…"}</p>
                    )
                  ) : (
                    <TakePreview assetId={t.id} payload={t.payload} title={t.title} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <MediaStorageNote compact />
      </div>
    </div>
  );
}

const GEMINI_VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"];

interface TakePayload {
  text: string;
  voiceName?: string;
  rate: number;
  pitch: number;
  lang: string;
}

function TakePreview({ payload, title }: { assetId: string; payload: string; title: string }) {
  let params: TakePayload | null = null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && typeof (parsed as { text?: unknown }).text === "string") {
      params = parsed as TakePayload;
    }
  } catch {
    params = null;
  }
  if (!params || typeof params.text !== "string") {
    return <p className="text-xs text-destructive">Take data unreadable — delete and re-record.</p>;
  }
  return <SpeechPreview text={params.text} voiceName={params.voiceName} rate={params.rate} pitch={params.pitch} lang={params.lang} label={title} />;
}
