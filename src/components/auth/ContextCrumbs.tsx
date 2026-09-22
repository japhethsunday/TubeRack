import { PREVIEW_IDENTITY } from "@/src/config/identity";

/**
 * User → Workspace → Channel → Project chain. Makes the hierarchy explicit
 * so account settings are never confused with workspace settings.
 */
export function ContextCrumbs({ project }: { project?: string }) {
  const chain = [
    ["User", PREVIEW_IDENTITY.name + " (preview)"],
    ["Workspace", PREVIEW_IDENTITY.workspace],
    ["Channel", PREVIEW_IDENTITY.channel],
  ] as const;
  return (
    <ol aria-label="User, workspace, channel, project" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-text">
      {chain.map(([k, v]) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className="font-semibold uppercase tracking-wide">{k}</span>
          <span className="text-foreground">{v}</span>
          <span aria-hidden="true">›</span>
        </li>
      ))}
      {project && (
        <li className="flex items-center gap-1.5">
          <span className="font-semibold uppercase tracking-wide">Project</span>
          <span className="text-foreground">{project}</span>
        </li>
      )}
    </ol>
  );
}
