import { cn } from "@/lib/utils";

export type Bar = {
  // Short label under the axis (shown for the first, middle and last bar).
  label: string;
  value: number;
  // Full text of the hover tip and the table view.
  title: string;
  // "warn" / "bad" paint a bar in the status colors (latency only).
  tone?: "warn" | "bad";
};

// One series of thin bars on a baseline: the color is the Zemana purple, the
// count lives in the tip on hover and in a hidden table for screen readers.
// No legend: the card title names the series.
export function BarChart({
  bars,
  caption,
  unit = "",
  height = 120,
  className,
}: {
  bars: Bar[];
  caption: string;
  unit?: string;
  height?: number;
  className?: string;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const width = 600;
  const slot = width / Math.max(1, bars.length);
  const barWidth = Math.max(2, Math.min(24, slot - 2));
  const ticks = new Set(
    bars.length > 0
      ? [0, Math.floor((bars.length - 1) / 2), bars.length - 1]
      : [],
  );

  return (
    <figure className={cn("relative grid gap-1", className)}>
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>
          máx. {max.toLocaleString("pt-BR")}
          {unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-28 w-full overflow-visible"
        aria-hidden="true"
      >
        <line
          x1={0}
          x2={width}
          y1={height - 0.5}
          y2={height - 0.5}
          className="stroke-border"
          strokeWidth={1}
        />
        {bars.map((bar, index) => {
          const h =
            bar.value === 0 ? 0 : Math.max(3, (bar.value / max) * (height - 4));
          const x = index * slot + (slot - barWidth) / 2;
          return (
            <g key={index}>
              {/* Hit area taller than the bar, for the tip. */}
              <rect
                x={index * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
              >
                <title>{bar.title}</title>
              </rect>
              {h > 0 ? (
                <path
                  d={roundedTop(
                    x,
                    height - h,
                    barWidth,
                    h,
                    Math.min(4, barWidth / 2),
                  )}
                  className={cn(
                    "pointer-events-none",
                    bar.tone === "bad"
                      ? "fill-destructive"
                      : bar.tone === "warn"
                        ? "fill-status-requested-border"
                        : "fill-primary",
                  )}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="relative h-4 text-[11px] text-muted-foreground">
        {bars.map((bar, index) =>
          ticks.has(index) ? (
            <span
              key={index}
              className="absolute top-0 whitespace-nowrap"
              style={{
                left: `${((index + 0.5) / bars.length) * 100}%`,
                transform:
                  index === 0
                    ? "translateX(-25%)"
                    : index === bars.length - 1
                      ? "translateX(-75%)"
                      : "translateX(-50%)",
              }}
            >
              {bar.label}
            </span>
          ) : null,
        )}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <tbody>
            {bars.map((bar, index) => (
              <tr key={index}>
                <td>{bar.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// A bar with rounded top corners, square on the baseline.
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, h);
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    "Z",
  ].join(" ");
}
