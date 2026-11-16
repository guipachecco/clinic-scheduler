import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Every button presses in a little (active:scale) and answers the pointer
  // in 150ms; the filled ones carry a thin darker base so they read as raised.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        // The main action of a screen: Zemana yellow with purple text.
        default:
          "bg-highlight font-bold text-highlight-foreground shadow-[inset_0_-2px_0_rgb(0_0_0/0.14),0_1px_2px_rgb(0_0_0/0.08)] hover:brightness-105 active:shadow-[inset_0_1px_0_rgb(0_0_0/0.14)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_-2px_0_rgb(0_0_0/0.18),0_1px_2px_rgb(0_0_0/0.08)] hover:bg-destructive/90 focus-visible:ring-destructive/20 active:shadow-[inset_0_1px_0_rgb(0_0_0/0.18)]",
        outline:
          "border border-input bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)] hover:border-foreground/40 hover:bg-accent hover:text-accent-foreground active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        // Soft, colored actions: a good outcome and a bad one. Quieter than
        // the main action, clearer than an outline.
        success:
          "bg-status-completed text-status-completed-foreground ring-1 ring-status-completed-foreground/20 ring-inset hover:ring-status-completed-foreground/45",
        danger:
          "bg-status-no-show text-status-no-show-foreground ring-1 ring-status-no-show-foreground/20 ring-inset hover:ring-status-no-show-foreground/45",
        // An "add another" action inside a list or a card.
        dashed:
          "border border-dashed border-input text-muted-foreground hover:border-foreground/50 hover:bg-accent hover:text-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-11 px-5 text-[15px] font-semibold has-[>svg]:px-4",
        sm: "h-9 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5",
        lg: "h-12 px-6 has-[>svg]:px-4",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
