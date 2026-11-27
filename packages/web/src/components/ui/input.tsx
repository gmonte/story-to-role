import * as React from "react";

import { cn } from "@repo/web/lib/utils";

const field =
  "border-input selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm";

// The native pickers iOS sizes content-box whatever the page says, so the
// field's padding and border would widen it past its container.
const pickerTypes = new Set(["date", "time", "datetime-local", "month"]);

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  if (type && pickerTypes.has(type)) {
    // The box draws the field; the native control inside has no padding or
    // border, so it fills the box exactly.
    return (
      <div
        data-slot="input"
        className={cn(
          field,
          "items-center",
          "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
          "has-[input[aria-invalid=true]]:ring-destructive/20 dark:has-[input[aria-invalid=true]]:ring-destructive/40 has-[input[aria-invalid=true]]:border-destructive",
          "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50",
          className
        )}
      >
        <input
          type={type}
          className="h-full w-full min-w-0 border-0 bg-transparent p-0 outline-none disabled:pointer-events-none"
          {...props}
        />
      </div>
    );
  }
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        field,
        "file:text-foreground placeholder:text-muted-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
