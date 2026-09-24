import type { ReactNode } from "react";
import { cx } from "@/src/components/ui/cx";

/**
 * Safe, dependency-free Markdown for AI output. Builds React elements only
 * (no innerHTML): headings, paragraphs, bold/italic/code/links, nested
 * bullet and numbered lists, quotes, rules, fenced code, and simple tables.
 */

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "rule" }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: { text: string; children: Block[] }[] }
  | { type: "table"; header: string[]; rows: string[][] };

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function indentOf(line: string): number {
  return (line.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  return parseLines(lines);
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (trimmed.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(trimmed);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (trimmed.startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (trimmed.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) body.push(lines[i++].trim().replace(/^>\s?/, ""));
      blocks.push({ type: "quote", text: body.join(" ") });
      continue;
    }
    const li = LIST_RE.exec(line);
    if (li) {
      const baseIndent = indentOf(line);
      const ordered = /\d/.test(li[2]);
      const list: Extract<Block, { type: "list" }> = { type: "list", ordered, start: ordered ? parseInt(li[2], 10) : 1, items: [] };
      while (i < lines.length) {
        const cur = lines[i];
        const m = LIST_RE.exec(cur);
        if (m && indentOf(cur) === baseIndent && /\d/.test(m[2]) === ordered) {
          const item = { text: m[3], children: [] as Block[] };
          i++;
          // Gather nested lines (deeper indent) and lazy continuation lines.
          const nested: string[] = [];
          while (i < lines.length) {
            const next = lines[i];
            if (!next.trim()) {
              const following = lines.slice(i + 1).find((l) => l.trim());
              if (following && indentOf(following) > baseIndent) {
                nested.push("");
                i++;
                continue;
              }
              break;
            }
            if (indentOf(next) > baseIndent) {
              nested.push(next);
              i++;
            } else if (!LIST_RE.exec(next) && !/^(#{1,6}\s|>|```|\||([-*_])(\s*\2){2,}$)/.test(next.trim())) {
              item.text += ` ${next.trim()}`;
              i++;
            } else break;
          }
          if (nested.length) {
            const minIndent = Math.min(...nested.filter((l) => l.trim()).map(indentOf));
            const inner = nested.map((l) => l.slice(Math.min(minIndent, indentOf(l))));
            // A nested block that is plain text continues the item's paragraph.
            const parsed = parseLines(inner);
            for (const b of parsed) {
              if (b.type === "paragraph" && item.children.length === 0) item.text += `\n${b.text}`;
              else item.children.push(b);
            }
          }
          list.items.push(item);
        } else if (!cur.trim()) {
          const following = lines.slice(i + 1).find((l) => l.trim());
          const fm = following ? LIST_RE.exec(following) : null;
          if (fm && following && indentOf(following) === baseIndent && /\d/.test(fm[2]) === ordered) i++;
          else break;
        } else break;
      }
      blocks.push(list);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !LIST_RE.exec(lines[i]) && !/^(#{1,6}\s|>|```)/.test(lines[i].trim()) && !/^([-*_])(\s*\1){2,}$/.test(lines[i].trim())) {
      para.push(lines[i++].trim());
    }
    if (para.length) blocks.push({ type: "paragraph", text: para.join("\n") });
    else i++;
  }
  return blocks;
}

const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

/** Inline formatting: **bold**, *italic* / _italic_, `code`, [links](url), ~~strike~~. */
export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+?\*\*|__[^_]+?__)|(\*[^*\s][^*]*?\*|\b_[^_\s][^_]*?_\b)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key} className="font-semibold"><em>{renderInline(tok.slice(3, -3), key)}</em></strong>);
    else if (m[3]) out.push(<strong key={key} className="font-semibold text-foreground">{renderInline(tok.slice(2, -2), key)}</strong>);
    else if (m[4]) out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    else if (m[5]) out.push(<s key={key}>{tok.slice(2, -2)}</s>);
    else if (m[6]) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push(
        SAFE_URL.test(lm[2]) ? (
          <a key={key} href={lm[2]} target={lm[2].startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
            {lm[1]}
          </a>
        ) : (
          lm[1]
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((line, i) => (i === 0 ? renderInline(line, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...renderInline(line, `${key}-${i}`)]));
}

const HEADING_CLASS = [
  "",
  "text-lg font-semibold tracking-tight",
  "text-base font-semibold tracking-tight",
  "text-[0.95rem] font-semibold",
  "text-sm font-semibold",
  "text-sm font-semibold text-muted-text",
  "text-xs font-semibold uppercase tracking-wider text-muted-text",
];

function renderBlocks(blocks: Block[], keyPrefix: string): ReactNode[] {
  return blocks.map((b, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (b.type) {
      case "heading": {
        const Tag = (`h${Math.min(6, b.level + 2)}`) as "h3";
        return <Tag key={key} className={cx(HEADING_CLASS[b.level], "mt-5 first:mt-0")}>{renderInline(b.text, key)}</Tag>;
      }
      case "paragraph":
        return <p key={key} className="mt-3 first:mt-0">{withBreaks(b.text, key)}</p>;
      case "rule":
        return <hr key={key} className="my-5 border-border" />;
      case "quote":
        return <blockquote key={key} className="mt-3 border-l-2 border-primary/50 pl-3 text-muted-text first:mt-0">{renderInline(b.text, key)}</blockquote>;
      case "code":
        return <pre key={key} className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs first:mt-0">{b.text}</pre>;
      case "table":
        return (
          <div key={key} className="mt-3 overflow-x-auto first:mt-0">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-text">
                <tr>{b.header.map((h, j) => <th key={j} className="border-b border-border px-2 py-1.5 font-medium">{renderInline(h, `${key}-h${j}`)}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-b border-border/60">{r.map((c, k) => <td key={k} className="px-2 py-1.5 align-top">{renderInline(c, `${key}-${j}-${k}`)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "list": {
        const Tag = b.ordered ? "ol" : "ul";
        return (
          <Tag key={key} start={b.ordered && b.start !== 1 ? b.start : undefined} className={cx("mt-3 space-y-2 pl-5 first:mt-0", b.ordered ? "list-decimal marker:font-semibold marker:text-primary" : "list-disc marker:text-primary/70")}>
            {b.items.map((it, j) => (
              <li key={j} className="pl-1">
                {withBreaks(it.text, `${key}-${j}`)}
                {it.children.length > 0 && <div className="mt-1.5 [&>ul]:mt-1.5 [&>ol]:mt-1.5">{renderBlocks(it.children, `${key}-${j}c`)}</div>}
              </li>
            ))}
          </Tag>
        );
      }
    }
  });
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cx("break-words text-sm leading-relaxed text-foreground/90", className)}>{renderBlocks(parseMarkdown(text), "md")}</div>;
}

export { stripMarkdown } from "@/src/lib/text/markdown";

