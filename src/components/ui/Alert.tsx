import { AlertTriangle, Info, CheckCircle2, OctagonX } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

const tones = {
  info: { icon: Info, cls: "border-info/30 bg-info/10 text-foreground" },
  ok: { icon: CheckCircle2, cls: "border-success/30 bg-success/10 text-foreground" },
  warn: { icon: AlertTriangle, cls: "border-warning/30 bg-warning/10 text-foreground" },
  bad: { icon: OctagonX, cls: "border-destructive/30 bg-destructive/10 text-foreground" },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof tones;
  title: string;
  children?: React.ReactNode;
}) {
  const { icon: Icon, cls } = tones[tone];
  return (
    <div role="alert" className={cx("rounded-lg border p-4", cls)}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {title}
      </p>
      {children && <div className="mt-1 text-sm text-muted-text">{children}</div>}
    </div>
  );
}
