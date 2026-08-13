// shadcn/ui input (new-york, Tailwind v4), vendored — relative imports and
// forwardRef (React 18; upstream now assumes React 19 ref-as-prop).
import * as React from "react";

import {cn} from "../../lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({className, type, ...props}, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        data-slot="input"
        className={cn(
          "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export {Input};
