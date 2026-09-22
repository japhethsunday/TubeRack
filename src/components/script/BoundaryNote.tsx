import { PlugZap } from "lucide-react";
import { Alert } from "@/src/components/ui/Alert";
import { Badge } from "@/src/components/ui/Badge";

/** Provider boundary for script generation ops: shows what WOULD be sent. */
export function ProviderBoundaryNote({
  operation,
  contextLines,
}: {
  operation: string;
  contextLines: string[];
}) {
  return (
    <div className="space-y-3">
      <Alert tone="info" title={`${operation} — provider generation (Phase 11)`}>
        <span className="block">
          The request is assembled locally and shown below. Nothing was sent —
          provider execution connects in Phase 11.
        </span>
      </Alert>
      <div className="rounded-lg bg-muted/50 p-3 text-xs" aria-label="Assembled request preview">
        <p className="font-medium">Would send:</p>
        <ul className="mt-1 space-y-0.5 text-muted-text">
          {contextLines.map((l, i) => (
            <li key={i}>· {l}</li>
          ))}
        </ul>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-text">
        <PlugZap className="size-3.5" aria-hidden="true" />
        Integration boundary <Badge tone="preview">Phase 11</Badge>
      </p>
    </div>
  );
}
