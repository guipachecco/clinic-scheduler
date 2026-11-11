// The header every panel screen opens with: an optional line above the title
// (a count, a date), the title, and the screen's actions on the right.
export function PageHeader({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid min-w-0 gap-0.5">
        {eyebrow ? (
          <p className="text-sm text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="font-heading text-2xl font-bold tracking-tight break-words md:text-3xl">
          {title}
        </h1>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}
