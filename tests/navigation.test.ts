import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NAV_SECTIONS, ALL_NAV_ITEMS, SEARCHABLE_ROUTES, AUTH_PAGES, COMMAND_INDEX, INTEL_PAGES, STUDIO_PAGES, FULL_COMMAND_INDEX } from "@/src/config/navigation";

describe("navigation config", () => {
  it("keeps slugs unique and statuses valid", () => {
    const slugs = ALL_NAV_ITEMS.map((i) => i.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const item of ALL_NAV_ITEMS) {
      assert.ok(["live", "preview", "planned"].includes(item.status), item.slug);
      assert.ok(item.label.length > 0 && item.href.startsWith("/"), item.slug);
      assert.ok(item.phase.startsWith("Phase"), item.slug);
    }
  });

  it("preserves hierarchy: workspace, production, system", () => {
    assert.deepEqual(
      NAV_SECTIONS.map((s) => s.title),
      ["Workspace", "Production", "System"],
    );
  });

  it("exposes only real routes to search and never dead planned links", () => {
    assert.ok(!SEARCHABLE_ROUTES.some((i) => i.status === "planned"));
    assert.ok(SEARCHABLE_ROUTES.some((i) => i.href === "/dashboard"));
    assert.ok(!SEARCHABLE_ROUTES.some((i) => i.href === "/design"));
    for (const item of ALL_NAV_ITEMS.filter((i) => i.status === "preview")) {
      assert.ok(
        item.href.startsWith("/projects/preview"),
        `${item.slug} must land on the preview workspace`,
      );
    }
  });

  it("indexes auth pages for search without putting them in the sidebar", () => {
    assert.ok(AUTH_PAGES.some((i) => i.href === "/login"));
    assert.ok(AUTH_PAGES.some((i) => i.href === "/signup"));
    assert.ok(AUTH_PAGES.some((i) => i.href === "/onboarding"));
    assert.ok(!ALL_NAV_ITEMS.some((i) => i.href === "/login"));
    assert.ok(COMMAND_INDEX.length > SEARCHABLE_ROUTES.length);
    assert.ok(!COMMAND_INDEX.some((i) => i.status === "planned"));
  });

  it("exposes eight live intelligence pages under /intelligence", () => {
    assert.equal(INTEL_PAGES.length, 8);
    const slugs = [...ALL_NAV_ITEMS.map((i) => i.slug), ...AUTH_PAGES.map((i) => i.slug), ...INTEL_PAGES.map((i) => i.slug), ...STUDIO_PAGES.map((i) => i.slug)];
    assert.equal(new Set(slugs).size, slugs.length);
    for (const item of INTEL_PAGES) {
      assert.equal(item.status, "live");
      assert.ok(item.href.startsWith("/intelligence/"), item.slug);
    }
    assert.ok(FULL_COMMAND_INDEX.some((i) => i.href === "/intelligence/lab"));
    assert.ok(FULL_COMMAND_INDEX.some((i) => i.href === "/intelligence"));
  });

  it("exposes script, storyboard, video, and packaging studios to search", () => {
    assert.equal(STUDIO_PAGES.length, 4);
    assert.ok(FULL_COMMAND_INDEX.some((i) => i.href === "/studio/script"));
    assert.ok(FULL_COMMAND_INDEX.some((i) => i.href === "/studio/storyboard"));
    assert.ok(FULL_COMMAND_INDEX.some((i) => i.href === "/studio/video"));
    assert.ok(FULL_COMMAND_INDEX.some((i) => i.href === "/studio/package"));
  });
});
