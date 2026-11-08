import { cn } from "@/lib/utils";
import { STATUS_LABELS, type Status } from "@/modules/appointments/fields";

// Full class names, so Tailwind sees them. Each status also has its text
// label, never color alone.
const STATUS_CLASSES: Record<Status, string> = {
  requested:
    "border border-dashed border-status-requested-border bg-status-requested text-status-requested-foreground",
  confirmed: "bg-status-confirmed text-status-confirmed-foreground",
  completed: "bg-status-completed text-status-completed-foreground",
  no_show: "bg-status-no-show text-status-no-show-foreground",
  cancelled: "bg-status-cancelled text-status-cancelled-foreground",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status;
  // Overrides the default text, for lists that word the statuses differently.
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-semibold",
        STATUS_CLASSES[status],
        className,
      )}
    >
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
