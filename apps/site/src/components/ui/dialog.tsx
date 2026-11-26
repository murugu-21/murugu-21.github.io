// Vendored shadcn/ui, trimmed to what the chat widget uses and unstyled. DialogContent leaves the
// portal, overlay and close button to the caller, and DialogPortal portals into #ui-portal-host
// (usePortalHost), not document.body.

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { usePortalHost } from "#src/components/ui/portal-host.ts";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogPortal(
  props: Omit<React.ComponentProps<typeof DialogPrimitive.Portal>, "container">
) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal" {...props} container={usePortalHost()} />
  );
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
  DialogPortal,
  DialogTitle,
  DialogTrigger
};
