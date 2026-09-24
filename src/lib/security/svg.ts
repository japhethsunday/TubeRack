/**
 * SVG sanitizer for markup rendered with dangerouslySetInnerHTML.
 *
 * SVG drafts and thumbnail bases are synced through the account and shared
 * with workspace members, so they are untrusted input. This removes every
 * script vector: <script>, <foreignObject> (embeds HTML), frames/objects,
 * animation elements that can rewrite attributes, event-handler attributes,
 * and links/hrefs other than fragment ids and inline raster images.
 */

const BLOCKED_ELEMENTS = ["script", "foreignobject", "iframe", "frame", "object", "embed", "applet", "meta", "link", "base", "animate", "set", "animatemotion", "animatetransform", "handler", "listener"];
const SAFE_HREF = /^(#|data:image\/(png|jpe?g|gif|webp);base64,)/i;
const URL_ATTRS = new Set(["href", "xlink:href", "src", "action", "formaction"]);

function sanitizeWithDom(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return "";
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (BLOCKED_ELEMENTS.includes(child.localName.toLowerCase())) {
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if (URL_ATTRS.has(name) && !SAFE_HREF.test(value)) el.removeAttribute(attr.name);
      else if (name === "style" && /(url\s*\(|expression\s*\(|javascript:)/i.test(value)) el.removeAttribute(attr.name);
    }
  };
  walk(root);
  return new XMLSerializer().serializeToString(root);
}

/** String-level fallback for server rendering (no DOM available). */
function sanitizeWithRegex(svg: string): string {
  let out = svg;
  for (const tag of BLOCKED_ELEMENTS) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "").replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  out = out.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\s((?:xlink:)?href|src|action|formaction)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m, _n, _v, a, b, c) => (SAFE_HREF.test((a ?? b ?? c ?? "").trim()) ? m : ""));
  out = out.replace(/\sstyle\s*=\s*("[^"]*(url\s*\(|expression\s*\(|javascript:)[^"]*"|'[^']*(url\s*\(|expression\s*\(|javascript:)[^']*')/gi, "");
  return out.trim().toLowerCase().startsWith("<svg") ? out : "";
}

export function sanitizeSvg(svg: string): string {
  if (!svg) return "";
  if (typeof DOMParser !== "undefined" && typeof XMLSerializer !== "undefined") {
    try {
      return sanitizeWithDom(svg);
    } catch {
      // fall through to the string sanitizer
    }
  }
  return sanitizeWithRegex(svg);
}
