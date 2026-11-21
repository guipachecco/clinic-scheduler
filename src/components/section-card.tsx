import { cn } from "@/lib/utils";

import { Icon, type IconName } from "./icon";

// A titled block of a panel screen: icon chip, heading, an optional line
// under it, and the content with room to breathe.
export function SectionCard({
  id,
  title,
  icon,
  description,
  className,
  children,
}: {
  id: string;
  title: string;
  icon?: IconName;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "grid gap-5 rounded-2xl border bg-card p-5 shadow-sm md:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-text"
          >
            <Icon name={icon} />
          </span>
        ) : null}
        <div className="grid min-w-0 gap-1 self-center">
          <h2 id={id} className="font-heading text-lg leading-tight font-bold">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}
