import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, stripMarkdown } from "@/src/components/ui/Markdown";

const sample = readFileSync(new URL("./fixtures-analysis.md", import.meta.url), "utf8");

describe("Markdown renderer", () => {
  it("renders a real Gemini analysis with no leftover markup", () => {
    const html = renderToStaticMarkup(<Markdown text={sample} />);
    const visible = html.replace(/<[^>]+>/g, "");
    assert.ok(!visible.includes("**"), "no bold markers");
    assert.ok(!/(^|\s)\*\s/.test(visible), "no bullet asterisks");
    assert.ok(!visible.includes("###"), "no heading hashes");
    assert.ok(!visible.includes("---"), "no rule dashes");
    assert.ok(html.includes("<h3"), "title heading");
    assert.ok(html.includes("<h5"), "section heading");
    assert.ok(html.includes("<ol"), "numbered list");
    assert.ok(/<li[^>]*>.*?<ul/.test(html), "nested bullets inside numbered items");
    assert.ok(html.includes("<strong"), "bold");
    assert.ok(html.includes("<em>"), "italics");
    assert.ok(html.includes("<code"), "inline code");
    assert.ok(html.includes("<hr"), "rule");
    assert.ok(visible.includes("Landscape Metric:"), "text kept");
  });

  it("escapes HTML and blocks unsafe links", () => {
    const html = renderToStaticMarkup(<Markdown text={'<img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://youtube.com)'} />);
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("javascript:"));
    assert.ok(html.includes('href="https://youtube.com"'));
  });

  it("handles tables and strips markdown to plain text", () => {
    const html = renderToStaticMarkup(<Markdown text={"| A | B |\n|---|---|\n| 1 | **2** |"} />);
    assert.ok(html.includes("<table") && html.includes("<strong"));
    assert.equal(stripMarkdown("### Title\n**Bold** and *it* `c`\n---\n* item"), "Title\nBold and it c\n\n* item");
  });
});
