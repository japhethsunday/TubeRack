import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Masker } from "@/src/server/ai/mask";

describe("AI privacy masking", () => {
  it("hides emails and learned names, and restores them exactly", () => {
    const m = new Masker();
    const data = m.value({ users: [{ email: "Ada@Example.com", name: "Ada Lovelace", credits: 5 }], note: "Ada Lovelace wrote from ada@example.com" });
    const json = JSON.stringify(data);
    assert.doesNotMatch(json, /ada@example\.com|Ada Lovelace/i);
    assert.match(json, /user_1@hidden\.example/);
    assert.match(json, /Person_1/);
    assert.equal(m.unmaskText("Give user_1@hidden.example 50 credits, Person_1 asked"), "Give ada@example.com 50 credits, Ada Lovelace asked");
    assert.deepEqual(m.unmask({ email: "user_1@hidden.example", amount: 50 }), { email: "ada@example.com", amount: 50 });
  });
  it("uses the same placeholder for the same person", () => {
    const m = new Masker();
    const a = m.text("x@y.com and X@Y.com and z@y.com");
    assert.equal(a, "user_1@hidden.example and user_1@hidden.example and user_2@hidden.example");
  });
  it("only replaces whole-word names", () => {
    const m = new Masker();
    m.addName("Sam");
    assert.equal(m.text("Sam made a Sample video"), "Person_1 made a Sample video");
  });
  it("keeps our own addresses and names that should stay visible", () => {
    const m = new Masker(["Japheth Sunday"]);
    m.addName("Japheth Sunday");
    assert.equal(m.text("Japheth Sunday at founder@recktube.xyz"), "Japheth Sunday at founder@recktube.xyz");
  });
  it("leaves unknown placeholders and plain text untouched", () => {
    const m = new Masker();
    assert.equal(m.unmaskText("Person_9 and user_9@hidden.example"), "Person_9 and user_9@hidden.example");
    assert.equal(m.text("No personal data here."), "No personal data here.");
  });
});

describe("phone and card masking", () => {
  it("hides card and phone numbers people type", async () => {
    const { hideNumbers } = await import("@/src/server/ai/mask");
    assert.equal(hideNumbers("my card 4111 1111 1111 1111 was charged"), "my card [card number] was charged");
    assert.equal(hideNumbers("card 4111-1111-1111-1111"), "card [card number]");
    assert.equal(hideNumbers("call me on +234 801 234 5678 please"), "call me on [phone number] please");
    assert.equal(hideNumbers("or 08012345678"), "or [phone number]");
    assert.equal(hideNumbers("US (555) 123-4567"), "US [phone number]");
  });
  it("leaves dates, times, amounts and ids alone", async () => {
    const { hideNumbers } = await import("@/src/server/ai/mask");
    for (const s of ["2026-09-30T12:00", "balance 1500 credits", "order 12345", "joined 2026-09-29", "video dQw4w9WgXcQ", "id 3f2b6c1e-8a4d-4c2e-9b1a-1234567890ab", "1234567890123", "at 17:00 on 30/09/2026", "$19.99"]) {
      assert.equal(hideNumbers(s), s, s);
    }
  });
  it("applies inside the Masker", () => {
    const m = new Masker();
    assert.equal(m.text("I'm ada@example.com, +2348012345678"), "I'm user_1@hidden.example, [phone number]");
  });
});
