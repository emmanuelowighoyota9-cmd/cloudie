import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary-hover",
        secondary:
          "border-transparent bg-surface-2 text-foreground [a&]:hover:bg-elevated",
        destructive:
          "border-error/30 bg-error/15 text-error [a&]:hover:bg-error/25 focus-visible:ring-error/30",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // Status tones. Each is a tinted chip with a coloured label — the text
        // carries the meaning, so the badge is still readable in greyscale and
        // to anyone who cannot separate the four hues.
        success: "border-success/30 bg-success/15 text-success [a&]:hover:bg-success/25",
        warning: "border-warning/30 bg-warning/15 text-warning [a&]:hover:bg-warning/25",
        info: "border-info/30 bg-info/15 text-info [a&]:hover:bg-info/25",
        // Secondary accent. Social callouts only — a channel or community
        // invitation. Never a CTA and never a status.
        social: "border-social/30 bg-social/10 text-social [a&]:hover:bg-social/20",
        danger: "border-error/30 bg-error/15 text-error [a&]:hover:bg-error/25",
        // Alias kept for the many call sites that already pass `error`.
        error: "border-error/30 bg-error/15 text-error [a&]:hover:bg-error/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
