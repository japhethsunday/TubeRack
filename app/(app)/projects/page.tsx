import Link from "next/link";
import { FolderKanban, ArrowRight } from "lucide-react";
import { NewProjectButton } from "@/src/components/patterns/NewProjectDialog";
import { EmptyState } from "@/src/components/ui/states";
import { Breadcrumb } from "@/src/components/ui/data";
import { Badge } from "@/src/components/ui/Badge";

/** Projects index: honest empty state + link to the preview workspace. */
export default function ProjectsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Projects" }]} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-text">
            One project carries an idea from research to published video and
            back into strategy.
          </p>
        </div>
        <NewProjectButton label="New project" />
      </div>

      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        body="When project persistence ships in Phase 4, every project will list here with its stage, updated time, and next step."
        action={<NewProjectButton label="Create your first project" />}
      />

      <section aria-label="Preview workspace" className="rounded-xl border border-dashed border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              Sample episode — design preview
              <Badge tone="preview">Preview</Badge>
            </p>
            <p className="mt-1 text-sm text-muted-text">
              Explore the project workspace layout, stage tabs, and editor
              visuals with static preview data.
            </p>
          </div>
          <Link
            href="/projects/preview"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            Open preview workspace
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
