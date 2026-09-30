import { Fragment } from "react";

/** Email addresses and web addresses (recktube.xyz/…, youtube.com/…) inside text become links. */
const PATTERN = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|((?:https?:\/\/)?(?:www\.)?(?:recktube\.xyz|youtube\.com|myaccount\.google\.com)(?:\/[\w\-./?=&%#]*)?)/g;

export function Linkify({ text, className = "underline underline-offset-2" }: { text: string; className?: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    // Keep a sentence's full stop outside the link.
    let raw = m[0];
    let tail = "";
    while (/[.,)]$/.test(raw)) {
      tail = raw.slice(-1) + tail;
      raw = raw.slice(0, -1);
    }
    if (m[1]) out.push(<a key={i} href={`mailto:${raw}`} className={className}>{raw}</a>);
    else {
      const href = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
      const internal = /(^|\/\/)(www\.)?recktube\.xyz/.test(raw);
      out.push(
        <a key={i} href={internal ? href.replace(/^https?:\/\/(www\.)?recktube\.xyz/, "") || "/" : href} className={className} {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
          {raw}
        </a>,
      );
    }
    if (tail) out.push(tail);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, k) => <Fragment key={k}>{n}</Fragment>)}</>;
}
