import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSvg } from "@/src/lib/security/svg";
import { sanitizeReturnTo } from "@/src/lib/auth/session";

describe("SVG sanitizer (server fallback)", () => {
  it("removes scripts, handlers, foreignObject, and unsafe links", () => {
    const evil =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script>' +
      '<foreignObject><iframe src="javascript:alert(3)"></iframe></foreignObject>' +
      '<a href="javascript:alert(4)"><rect onclick="alert(5)" width="10" height="10"/></a>' +
      '<image href="https://evil.example/x.png"/><image href="data:image/png;base64,AAAA"/>' +
      '<set attributeName="href" to="javascript:alert(6)"/><use href="#ok"/>' +
      '<rect style="fill:url(javascript:alert(7))"/><text fill="#fff">Hi</text></svg>';
    const out = sanitizeSvg(evil);
    for (const bad of ["onload", "<script", "alert(2)", "foreignObject", "iframe", "javascript:", "onclick", "evil.example", "<set", "url(javascript"]) {
      assert.ok(!out.toLowerCase().includes(bad.toLowerCase()), `still contains ${bad}: ${out}`);
    }
    assert.ok(out.includes("data:image/png;base64,AAAA"));
    assert.ok(out.includes('href="#ok"'));
    assert.ok(out.includes(">Hi</text>"));
  });

  it("rejects non-SVG input", () => {
    assert.equal(sanitizeSvg('<img src=x onerror="alert(1)">'), "");
    assert.equal(sanitizeSvg(""), "");
  });

  it("attribute injection through overlay values is neutralized", () => {
    const out = sanitizeSvg('<svg><text fill="#fff" onmouseover="alert(1)">x</text></svg>');
    assert.ok(!out.includes("onmouseover"));
  });
});

describe("login return path", () => {
  it("only allows same-site paths", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/ok\n//evil"]) {
      assert.ok(!sanitizeReturnTo(bad).includes("evil") && !sanitizeReturnTo(bad).startsWith("javascript"), bad);
    }
    assert.equal(sanitizeReturnTo("/youtube?tab=upload"), "/youtube?tab=upload");
  });
});
