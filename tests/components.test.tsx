import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState, ErrorState } from "@/src/components/ui/states";
import { Alert } from "@/src/components/ui/Alert";
import { Badge } from "@/src/components/ui/Badge";
import { Progress } from "@/src/components/ui/feedback";
import { Breadcrumb, Table } from "@/src/components/ui/data";
import { ProjectProgress } from "@/src/components/patterns/ProjectProgress";
import { MediaCard } from "@/src/components/patterns/media";
import { AIGenerationPanel } from "@/src/components/patterns/AIGenerationPanel";
import { PREVIEW_PROGRESS } from "@/src/config/preview";

/** Server-render component tests: structure, labels, and honest states. No DOM needed. */
describe("ui components", () => {
  it("empty state explains purpose and next step", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No projects yet" body="Create one to begin." />,
    );
    assert.ok(html.includes("No projects yet"));
    assert.ok(html.includes("Create one to begin."));
  });

  it("error state names the failure and offers retry + recovery", () => {
    const html = renderToStaticMarkup(
      <ErrorState title="Render failed" body="Scene 2 timed out." onRetry={() => {}} />,
    );
    assert.ok(html.includes("Render failed"));
    assert.ok(html.includes("Scene 2 timed out."));
    assert.ok(html.includes("Retry"));
    assert.ok(html.includes("Back to dashboard"));
    assert.ok(html.includes('role="alert"'));
  });

  it("progress exposes its value to assistive tech", () => {
    const html = renderToStaticMarkup(<Progress value={62} label="Uploading" />);
    assert.ok(html.includes('aria-valuenow="62"'));
    assert.ok(html.includes('role="progressbar"'));
  });

  it("breadcrumb marks the current page", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: "Preview" }]} />,
    );
    assert.ok(html.includes('aria-current="page"'));
    assert.ok(html.includes('aria-label="Breadcrumb"'));
  });

  it("project progress lists every stage with a preview badge", () => {
    const html = renderToStaticMarkup(<ProjectProgress items={PREVIEW_PROGRESS} />);
    assert.ok(html.includes("Project progress"));
    assert.ok(html.includes("Preview"));
    for (const s of ["Storyboard", "Visuals", "Publishing"]) {
      assert.ok(html.includes(s), s);
    }
  });

  it("media card surfaces status honestly", () => {
    const html = renderToStaticMarkup(
      <MediaCard
        asset={{ id: "x", title: "Clip", kind: "Video", meta: "0:12", status: "failed" }}
      />,
    );
    assert.ok(html.includes("Failed"));
    assert.ok(html.includes("Delete"));
  });

  it("ai panel discloses its boundary instead of faking generation", () => {
    const html = renderToStaticMarkup(
      <AIGenerationPanel title="Hooks" capability="Text" boundaryNote="Connects in Phase 11." />,
    );
    assert.ok(html.includes("Pattern preview"));
    assert.ok(html.includes("Connects in Phase 11."));
    assert.ok(html.includes("Prompt / context"));
  });

  it("table renders rows and alert/badge carry their tones", () => {
    const table = renderToStaticMarkup(
      <Table
        caption="Ops"
        columns={[{ key: "n", header: "Name", render: (r) => r.name }]}
        rows={[{ id: "1", name: "Hook analysis" }]}
      />,
    );
    assert.ok(table.includes("Hook analysis"));
    const alert = renderToStaticMarkup(<Alert tone="bad" title="Down" />);
    assert.ok(alert.includes("Down"));
    const badge = renderToStaticMarkup(<Badge tone="preview">Preview</Badge>);
    assert.ok(badge.includes("Preview"));
  });
});
