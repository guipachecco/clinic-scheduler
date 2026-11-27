"use client";

import * as React from "react";

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

import { Input } from "./input";

// A password input with an eye button that shows or hides what was typed.
function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        className={cn("pr-12", className)}
        // After the props: the eye decides, whatever type was passed.
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Icon name={visible ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

export { PasswordInput };
