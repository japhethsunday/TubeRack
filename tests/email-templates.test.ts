import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "@/src/server/email-templates";

test("emails escape content and drop unsafe links", () => {
  const { html, text } = renderEmail({
    preheader: "p",
    heading: "<script>x</script>",
    blocks: [{ type: "videos", items: [{ title: "A & B", channel: "C", thumbnail: "javascript:alert(1)", url: "https://youtube.com/watch?v=1", meta: "1 view" }] }],
    cta: { label: "Go", url: "javascript:alert(1)" },
    reason: "r",
    appUrl: "https://tube-rack.vercel.app",
  });
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("A &amp; B"));
  assert.ok(!html.includes("javascript:"));
  assert.match(text, /A & B — C · 1 view/);
});
