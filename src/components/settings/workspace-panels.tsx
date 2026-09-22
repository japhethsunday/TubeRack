"use client";

import { useState } from "react";
import { Download, Trash2, Users } from "lucide-react";
import { Input } from "@/src/components/ui/fields";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";
import { EmptyState } from "@/src/components/ui/states";
import { Modal } from "@/src/components/ui/overlays";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { canConfirmDelete } from "@/src/components/auth/form";
import { ContextCrumbs } from "@/src/components/auth/ContextCrumbs";
import { PREVIEW_WORKSPACE } from "@/src/config/identity";

export function WorkspacePanel() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="grid max-w-3xl gap-4">
      <section aria-label="Hierarchy" className="rounded-xl border border-border p-5">
        <ContextCrumbs project="Sample episode (preview)" />
        <p className="mt-2 text-sm text-muted-text">
          Account settings are yours. Workspace settings govern the channel and
          team. They are separate on purpose.
        </p>
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
        className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2"
        aria-label="Workspace settings"
      >
        <Input label="Workspace name" defaultValue={PREVIEW_WORKSPACE.name} />
        <Input label="Slug" defaultValue={PREVIEW_WORKSPACE.slug} hint="Used in URLs and invites." />
        <div className="sm:col-span-2">
          <Button type="submit">Save workspace</Button>
          {saved && (
            <div className="mt-4">
              <AuthBoundaryNotice feature="Workspace update" validated="Workspace fields passed local validation." />
            </div>
          )}
        </div>
      </form>
      <section aria-label="Members" className="rounded-xl border border-border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-muted-text" aria-hidden="true" />
          Members
          <Badge tone="preview">Phase 4+</Badge>
        </h3>
        <div className="mt-3">
          <EmptyState
            title="Only you (preview)"
            body="Invites, roles, and permissions arrive with teams. Nothing to manage yet."
          />
        </div>
      </section>
    </div>
  );
}

export function BillingPanel() {
  return (
    <div className="grid max-w-3xl gap-4">
      <section aria-label="Current plan" className="rounded-xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Current plan</h3>
          <Badge tone="preview">Phase 10–11</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-text">
          {PREVIEW_WORKSPACE.plan}. No charges, trials, or balances exist.
        </p>
      </section>
      <EmptyState
        title="No usage to show"
        body="Credit balance, ledger, and per-operation metering activate with billing. Figures are never estimated."
      />
      <EmptyState
        title="No invoices"
        body="Payment methods, invoices, and subscription controls ship with billing."
      />
    </div>
  );
}

const EXPORT_CATEGORIES = ["Profile", "Projects", "Scripts", "Assets", "Settings", "Analytics"];

export function DataPanel() {
  const [selected, setSelected] = useState<string[]>(["Profile"]);
  const [requested, setRequested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [phrase, setPhrase] = useState("");

  function toggle(c: string) {
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRequested(true);
        }}
        className="rounded-xl border border-border p-5"
        aria-label="Data export"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Download className="size-4 text-muted-text" aria-hidden="true" />
          Export your data
        </h3>
        <fieldset className="mt-3">
          <legend className="text-xs text-muted-text">Include categories</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {EXPORT_CATEGORIES.map((c) => (
              <Checkbox key={c} label={c} checked={selected.includes(c)} onChange={() => toggle(c)} />
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="outline" className="mt-4" disabled={selected.length === 0}>
          Request export
        </Button>
        {requested && (
          <div className="mt-4">
            <AuthBoundaryNotice
              feature="Data export"
              validated={`${selected.length} categor${selected.length === 1 ? "y" : "ies"} selected (${selected.join(", ")}).`}
            />
          </div>
        )}
      </form>

      <section aria-label="Delete account" className="rounded-xl border border-destructive/40 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <Trash2 className="size-4" aria-hidden="true" />
          Delete account
        </h3>
        <p className="mt-1 text-sm text-muted-text">
          Deletion removes the account, workspaces, projects, assets, and
          history. Active subscriptions cancel first. This cannot be undone.
        </p>
        <Button variant="destructive" className="mt-3" onClick={() => { setConfirming(true); setDeleted(false); setPhrase(""); }}>
          Delete my account…
        </Button>
      </section>

      {confirming && (
        <Modal title="Delete account?" description="Final confirmation. Read carefully." onClose={() => setConfirming(false)}>
          {deleted ? (
            <AuthBoundaryNotice
              feature="Account deletion"
              validated="Confirmation phrase matched. Deletion is queued behind the Phase 11 backend — nothing was deleted."
            />
          ) : (
            <div className="space-y-4">
              <Alert tone="bad" title="Irreversible">
                Projects, brand profiles, credit history, and analytics for every
                workspace you own are destroyed with the account.
              </Alert>
              <Input
                label="Type DELETE to confirm"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!canConfirmDelete(phrase)}
                  title={canConfirmDelete(phrase) ? "Delete (deferred to Phase 11)" : "Type DELETE to enable"}
                  onClick={() => setDeleted(true)}
                >
                  Delete everything
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
