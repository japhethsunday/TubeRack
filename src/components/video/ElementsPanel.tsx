"use client";

import type { TextStyle } from "@/src/lib/video/types";

const STICKERS = ["🔥", "⭐", "👉", "✅", "❌", "💡", "🎯", "🚀", "💰", "❤️", "😂", "😮", "👀", "📌", "⚠️", "🎉", "👍", "🤯"];

const SHAPES: { label: string; text: string; style: Partial<TextStyle> }[] = [
  { label: "Subscribe button", text: "SUBSCRIBE", style: { background: "#ff0033", color: "#ffffff", weight: 800, size: 40 } },
  { label: "Arrow →", text: "➜", style: { background: "transparent", color: "#fde047", weight: 900, size: 120 } },
  { label: "Highlight bar", text: "   NEW   ", style: { background: "#7c3aed", color: "#ffffff", weight: 800, size: 36 } },
  { label: "Circle badge", text: "●", style: { background: "transparent", color: "#ef4444", weight: 900, size: 140 } },
];

const BACKGROUNDS = ["#000000", "#0b0b12", "#ffffff", "#18181b", "#1e1b4b", "#7c3aed", "#0ea5e9", "#f97316", "#16a34a", "#fde047"];

/** Stickers, graphic elements, and the frame background. */
export function ElementsPanel({
  background,
  onBackground,
  onAddElement,
}: {
  background: string;
  onBackground: (color: string) => void;
  onAddElement: (text: string, style: Partial<TextStyle>, name: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">Stickers</p>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {STICKERS.map((s) => (
            <button key={s} type="button" onClick={() => onAddElement(s, { background: "transparent", size: 110, weight: 400 }, `Sticker ${s}`)} className="ui-lift flex aspect-square items-center justify-center rounded-lg border border-border text-xl hover:bg-muted" aria-label={`Add sticker ${s}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">Elements</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {SHAPES.map((e) => (
            <button key={e.label} type="button" onClick={() => onAddElement(e.text, e.style, e.label)} className="ui-lift rounded-lg border border-border px-2 py-2 text-xs font-medium hover:bg-muted">
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">Background</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {BACKGROUNDS.map((c) => (
            <button key={c} type="button" onClick={() => onBackground(c)} aria-label={`Background ${c}`} aria-pressed={background === c} className="size-7 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: background === c ? "var(--color-primary, #7c3aed)" : "transparent", boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.4)" }} />
          ))}
          <input type="color" value={background} onChange={(e) => onBackground(e.target.value)} aria-label="Custom background" className="h-7 w-9 rounded border border-border" />
        </div>
        <p className="mt-1 text-[11px] text-muted-text">Shows behind every layer — visible around scaled or letterboxed media.</p>
      </div>
    </div>
  );
}
