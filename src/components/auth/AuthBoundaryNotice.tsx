import { PlugZap } from "lucide-react";
import { Alert } from "@/src/components/ui/Alert";
import { Badge } from "@/src/components/ui/Badge";

/**
 * Honest result panel after local validation passes: states exactly what was
 * validated, what was NOT done, and which phase connects the service.
 */
export function AuthBoundaryNotice({
  feature,
  validated,
  returnTo,
}: {
  feature: string;
  validated: string;
  returnTo?: string;
}) {
  return (
    <div className="space-y-3">
      <Alert tone="info" title={`${feature} — validated locally`}>
        <span className="block">{validated}</span>
        <span className="mt-1 block">
          Nothing was sent or stored: the authentication service connects in
          Phase 11.
        </span>
        {returnTo && (
          <span className="mt-1 block">
            Once sessions exist, you would continue to{" "}
            <code className="font-mono text-xs">{returnTo}</code>.
          </span>
        )}
      </Alert>
      <p className="flex items-center gap-2 text-xs text-muted-text">
        <PlugZap className="size-3.5" aria-hidden="true" />
        Integration boundary <Badge tone="preview">Phase 11</Badge>
      </p>
    </div>
  );
}
