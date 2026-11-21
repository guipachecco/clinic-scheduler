import * as React from "react";

import { cn } from "@/lib/utils";

// Native <select> styled like Input: keeps the phone's own picker.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-11 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-input bg-card py-1 pr-10 pl-3.5 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
