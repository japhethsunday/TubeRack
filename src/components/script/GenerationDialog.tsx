"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { writeScriptWithProvider } from "@/src/lib/ai-client";
import { Alert } from "@/src/components/ui/Alert";
import type { ScriptSection } from "@/src/lib/script/types";
import { ASSEMBLY_METHOD, assembleScript, type AssemblyInput } from "@/src/lib/script/engine";
import { COMPLEXITIES, LENGTH_TARGETS, STRUCTURES, TONES, formatNames } from "@/src/lib/script/formats";
import { countWords } from "@/src/lib/script/measure";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { ContextChips } from "@/src/components/intelligence/output";
import { MethodologyNote } from "@/src/components/intelligence/output";
import type { AssembledContext } from "@/src/lib/intelligence/context";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { downloadText, safeFileName } from "@/src/lib/download";

/**
 * Controlled generation: options → local assembly or Gemini draft →
 * preview → apply. Manual writing is always one click away. Gemini fills
 * the same section skeleton, so structure, scenes, and versions are unchanged.
 */
export function GenerationDialog({
  assembly,
  context,
  onApply,
  onClose,
  autoWrite = false,
  initialFormat,
  initialLength,
  initialInstruction = "",
}: {
  assembly: Omit<AssemblyInput, "format" | "tone" | "complexity" | "structure" | "targetWords" | "instruction">;
  context: AssembledContext;
  onApply: (sections: ScriptSection[], meta: { format: string; tone: string; complexity: string; structure: string; targetWords: number; wpm: number; instruction: string }) => void;
  onClose: () => void;
  /** Start writing with Gemini immediately and apply the draft when it lands. */
  autoWrite?: boolean;
  initialFormat?: string;
  initialLength?: string;
  initialInstruction?: string;
}) {
  const formats = formatNames();
  const [format, setFormat] = useState(initialFormat && formats.includes(initialFormat) ? initialFormat : formats[0]);
  const [tone, setTone] = useState<string>("Conversational");
  const [complexity, setComplexity] = useState<string>("Beginner");
  const [structure, setStructure] = useState<string>("Standard");
  const [lengthLabel, setLengthLabel] = useState(initialLength && LENGTH_TARGETS.some((l) => l.label === initialLength) ? initialLength : LENGTH_TARGETS[1].label);
  const [customWords, setCustomWords] = useState("900");
  const [instruction, setInstruction] = useState(initialInstruction);
  const [preview, setPreview] = useState<ScriptSection[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);

  const targetWords =
    lengthLabel === "Custom" ? Math.max(50, Number.parseInt(customWords, 10) || 900) : (LENGTH_TARGETS.find((l) => l.label === lengthLabel)?.words ?? 900);

  function run() {
    setAiModel(null);
    setPreview(
      assembleScript({ ...assembly, format, tone, complexity, structure, targetWords, instruction }),
    );
  }

  async function writeWithGemini() {
    const input = { ...assembly, format, tone, complexity, structure, targetWords, instruction };
    const skeleton = assembleScript(input);
    setWriting(true);
    setAiError(null);
    const outcome = await writeScriptWithProvider({
      ...input,
      sections: skeleton.map((s) => ({ type: s.type, heading: s.heading })),
    });
    setWriting(false);
    if (!outcome.ok) {
      setAiError(outcome.message);
      return;
    }
    setAiModel(outcome.data.model);
    const written = skeleton.map((s, i) => ({
      ...s,
      text: outcome.data.texts[i] ?? s.text,
      aiNote: "Drafted from your research. Check facts before recording.",
    }));
    if (autoWrite) {
      // Brief came from the Channel Creator: put the draft straight into the editor.
      onApply(written, { format, tone, complexity, structure, targetWords, wpm: 150, instruction });
      return;
    }
    setPreview(written);
  }

  const started = useRef(false);
  useEffect(() => {
    if (!autoWrite || started.current) return;
    started.current = true;
    void writeWithGemini();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open
  }, [autoWrite]);

  return (
    <Modal title="Generate script draft" description="Write a full draft, or assemble a local template from your intelligence." onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Format" value={format} onChange={(e) => { setFormat(e.target.value); setPreview(null); }}>
          {formats.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
        <Select label="Length" value={lengthLabel} onChange={(e) => { setLengthLabel(e.target.value); setPreview(null); }}>
          {LENGTH_TARGETS.map((l) => (
            <option key={l.label}>{l.label}</option>
          ))}
        </Select>
        <Select label="Tone" value={tone} onChange={(e) => setTone(e.target.value)}>
          {TONES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select label="Complexity" value={complexity} onChange={(e) => setComplexity(e.target.value)}>
          {COMPLEXITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select label="Structure" value={structure} onChange={(e) => setStructure(e.target.value)}>
          {STRUCTURES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        {lengthLabel === "Custom" && (
          <Input label="Target words" inputMode="numeric" value={customWords} onChange={(e) => setCustomWords(e.target.value)} />
        )}
        <div className="sm:col-span-2">
          <Textarea label="Creator instruction (supplements context)" rows={2} value={instruction} onChange={(e) => { setInstruction(e.target.value); setPreview(null); }} placeholder="e.g. open with the failed launch story…" />
        </div>
      </div>

      <div className="mt-4">
        <ContextChips context={context} />
      </div>

      {aiError && !preview && (
        <div className="mt-4">
          <Alert tone="warn" title="The draft could not be written">
            {aiError} You can still assemble the local template.
          </Alert>
        </div>
      )}

      {!preview ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Write manually instead
          </Button>
          <Button variant="outline" onClick={run} disabled={writing}>
            <Sparkles className="size-4" aria-hidden="true" />
            Assemble template
          </Button>
          <Button onClick={() => void writeWithGemini()} disabled={writing}>
            <Wand2 className="size-4" aria-hidden="true" />
            {writing ? "Writing…" : "Write draft"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium" role="status">
            {preview.length} sections · ~{preview.reduce((n, s) => n + countWords(s.text), 0)} words
            {aiModel ? " drafted" : " of starter text"}. Review before applying.
          </p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="Assembled preview">
            {preview.map((s) => (
              <li key={s.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{s.heading}. </span>
                <span className="text-muted-text">{s.text.slice(0, 140)}{s.text.length > 140 ? "…" : ""}</span>
              </li>
            ))}
          </ul>
          {!aiModel && <MethodologyNote text={ASSEMBLY_METHOD} />}
          <div className="flex justify-end gap-2">
            <DownloadButton
              label="Download draft"
              onDownload={() =>
                downloadText(
                  preview.map((s) => `## ${s.heading}\n\n${s.text}`).join("\n\n"),
                  safeFileName(`script ${format}`, "md"),
                  "text/markdown",
                )
              }
            />
            <Button variant="outline" onClick={() => setPreview(null)}>
              Adjust options
            </Button>
            <Button
              onClick={() =>
                onApply(preview, { format, tone, complexity, structure, targetWords, wpm: 150, instruction })
              }
            >
              Apply as new version
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
