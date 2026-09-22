import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NAV_SECTIONS, ALL_NAV_ITEMS, SEARCHABLE_ROUTES } from "@/src/config/navigation";

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
    assert.ok(SEARCHABLE_ROUTES.some((i) => i.href === "/design"));
    for (const item of ALL_NAV_ITEMS.filter((i) => i.status === "preview")) {
      assert.ok(
        item.href.startsWith("/projects/preview"),
        `${item.slug} must land on the preview workspace`,
      );
    }
  });
});
