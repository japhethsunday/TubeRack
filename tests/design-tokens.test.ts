import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SEMANTIC_COLOR_KEYS,
  lightPalette,
  darkPalette,
  SPACING_SCALE,
  spacing,
  radius,
  TYPE_VARIANTS,
  typeClasses,
} from "@/src/design/tokens";

describe("design tokens", () => {
  it("covers every required semantic color in both themes", () => {
    const required = [
      "background",
      "foreground",
      "surface",
      "elevated",
      "muted",
      "border",
      "primary",
      "primaryForeground",
      "secondary",
      "success",
      "warning",
      "destructive",
      "info",
      "mutedText",
      "disabledText",
    ];
    assert.deepEqual([...SEMANTIC_COLOR_KEYS], required);
    for (const key of required) {
      assert.match(lightPalette[key as keyof typeof lightPalette], /^#[0-9a-f]{6}$/i, `light.${key}`);
      assert.match(darkPalette[key as keyof typeof darkPalette], /^#[0-9a-f]{6}$/i, `dark.${key}`);
    }
  });

  it("keeps light and dark distinct where it matters", () => {
    assert.notEqual(lightPalette.background, darkPalette.background);
    assert.notEqual(lightPalette.foreground, darkPalette.foreground);
  });

  it("exposes a predictable spacing scale and semantic slots", () => {
    assert.ok(SPACING_SCALE.includes(4));
    for (const key of ["pageX", "pageY", "sectionGap", "cardPadding", "componentGap", "formGap", "navGap", "editorGap"] as const) {
      assert.ok(spacing[key].length > 0, key);
    }
    assert.ok(radius.sm && radius.full);
  });

  it("defines every typography variant with a class", () => {
    assert.equal(TYPE_VARIANTS.length, 9);
    for (const v of TYPE_VARIANTS) {
      assert.ok(typeClasses[v].includes("text-"), v);
    }
  });
});
