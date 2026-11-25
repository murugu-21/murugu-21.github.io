import { XIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      style={{ fontFamily: "inherit" }}
      icons={{ close: <XIcon className="size-4" aria-hidden /> }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-(--width) items-start gap-3 rounded-lg border border-glow-edge bg-card p-4 text-sm text-card-foreground shadow-lg",
          closeButton:
            "order-last -my-1.5 -mr-2 grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
        }
      }}
      {...props}
    />
  );
}

export { Toaster };
