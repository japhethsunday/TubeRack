import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Linkify } from "@/src/components/home/Linkify";

describe("clickable emails and links", () => {
  it("turns emails into mailto links and keeps the full stop outside", () => {
    const html = renderToStaticMarkup(<Linkify text="Email support@recktube.xyz." />);
    assert.match(html, /<a href="mailto:support@recktube\.xyz"[^>]*>support@recktube\.xyz<\/a>\./);
  });
  it("links our own pages internally and other sites in a new tab", () => {
    const html = renderToStaticMarkup(<Linkify text="See recktube.xyz/pricing and youtube.com/verify" />);
    assert.match(html, /<a href="\/pricing"/);
    assert.match(html, /<a href="https:\/\/youtube\.com\/verify"[^>]*target="_blank"/);
  });
  it("leaves plain text alone", () => {
    assert.equal(renderToStaticMarkup(<Linkify text="No links here." />), "No links here.");
  });
});

describe("support contact form API", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/v1/support/contact/route");
    return POST(new Request("http://localhost/api/v1/support/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  };
  const good = { name: "Ada", email: "ada@example.com", topic: "Question about Recktube", message: "How do credits refill each month?" };
  it("rejects a bad email and a too-short message", async () => {
    assert.equal((await post({ ...good, email: "nope" })).status, 400);
    assert.equal((await post({ ...good, message: "hi" })).status, 400);
    assert.equal((await post({ ...good, topic: "Something else" })).status, 400);
  });
  it("quietly accepts bots (hidden field filled) without sending anything", async () => {
    const res = await post({ ...good, website: "http://spam.example" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { data: { sent: true } });
  });
});
