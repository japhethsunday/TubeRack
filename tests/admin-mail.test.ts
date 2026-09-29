import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_TEMPLATES, missingFields, templateById } from "@/src/server/admin-mail";

const APP = "https://www.recktube.xyz";

describe("admin email templates", () => {
  it("every template renders a branded email with a subject and reply address", () => {
    assert.ok(ADMIN_TEMPLATES.length >= 10);
    for (const t of ADMIN_TEMPLATES) {
      const fields = Object.fromEntries(t.fields.map((f) => [f.key, f.key === "link" ? `${APP}/x` : `Sample ${f.key}`]));
      const m = t.build(fields, APP);
      assert.ok(m.subject.length > 5, t.id);
      assert.match(m.html, /recktube-logo-120\.png/, t.id);
      assert.match(m.text, new RegExp(`${t.mailbox}@recktube\\.xyz`), t.id);
    }
  });
  it("escapes user text and reports missing required fields", () => {
    const t = templateById("support-reply")!;
    const m = t.build({ name: "<b>x</b>", subject: "Hi", message: "<script>alert(1)</script>" }, APP);
    assert.ok(!m.html.includes("<script>alert"));
    assert.deepEqual(missingFields(t, { name: "", subject: "", message: "" }), ["Subject", "Your answer"]);
  });
  it("only allows https button links in custom emails", () => {
    const m = templateById("custom")!.build({ subject: "s", heading: "h", message: "m", button: "Go", link: "javascript:alert(1)" }, APP);
    assert.ok(!m.html.includes("javascript:"));
  });
});

describe("admin email defaults", () => {
  it("every template is ready to send straight from its defaults", () => {
    for (const t of ADMIN_TEMPLATES) {
      const fields = Object.fromEntries(t.fields.map((f) => [f.key, (f.default ?? "").replace("{{ref}}", "SEC-20260928-1234")]));
      fields.name = "Ada";
      assert.deepEqual(missingFields(t, fields), [], `${t.id} needs a default`);
      const out = t.build(fields, APP);
      assert.ok(out.subject && out.html.includes("Hi Ada"), t.id);
    }
    assert.ok(ADMIN_TEMPLATES.length >= 19);
  });
});

describe("founder signature", () => {
  it("signs founder mail personally as Founder & CEO", async () => {
    const { founderFrom } = await import("@/src/server/founder");
    const f = founderFrom("Ada Lovelace");
    assert.match(f.signoff, /Ada Lovelace\nFounder & CEO, Recktube/);
    assert.equal(f.fromName, "Ada Lovelace · Recktube");
    assert.doesNotMatch(f.signoff, /team/i);
    assert.equal(founderFrom('Eve <x@y>"\r\nBcc: z').fromName.includes("\n"), false);
  });
});
