// shadcn/ui dialog (new-york, Tailwind v4), vendored and trimmed to what the chat widget uses.
// No portal, so the .ui-island tokens still apply, and no layout or overlay styling: the
// chat panel positions itself.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay(props: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" {...props} />;
}

function DialogContent(props: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Content data-slot="dialog-content" {...props} />;
}

function DialogTitle(props: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

function DialogDescription(props: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogTitle,
  DialogTrigger
};
