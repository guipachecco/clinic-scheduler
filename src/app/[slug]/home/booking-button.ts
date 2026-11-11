import type { ClinicTheme } from "@/db/schema/clinic";
import { cn } from "@/lib/utils";

import { customColor } from "../page-theme";

// Classes of the page's main action (BookingBar), from the published look.
export function bookingButtonClass(theme: ClinicTheme): string {
  return cn(
    // The shape the owner chose (--radius-button, page-theme.tsx).
    "flex min-h-13 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] font-heading text-base font-extrabold shadow-[0_0_0_4px_var(--background)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    theme.buttonFill === "outline"
      ? // The page background behind the outline keeps the label readable
        // over the content that scrolls under the fixed bar.
        "border-2 border-primary-text bg-background text-primary-text hover:bg-muted"
      : customColor(theme)
        ? // The owner's color, in both themes.
          "bg-primary text-primary-foreground hover:bg-primary-pressed"
        : // Purple in the light theme, the Zemana yellow in the dark one.
          "bg-primary text-primary-foreground hover:bg-primary-pressed dark:bg-highlight dark:text-highlight-foreground dark:hover:bg-highlight/90",
  );
}
