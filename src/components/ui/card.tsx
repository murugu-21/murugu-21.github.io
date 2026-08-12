// shadcn/ui card (new-york, Tailwind v4), vendored — relative imports;
// only the pieces the chat widget uses.
import * as React from "react";

import {cn} from "../../lib/utils";

function Card({className, ...props}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({className, ...props}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-4 py-3", className)}
      {...props}
    />
  );
}

function CardContent({className, ...props}: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-4", className)} {...props} />
  );
}

function CardFooter({className, ...props}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4 py-3", className)}
      {...props}
    />
  );
}

export {Card, CardHeader, CardContent, CardFooter};
