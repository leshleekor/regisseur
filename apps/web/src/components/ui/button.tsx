import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-[color:var(--accent)] px-4 py-2 text-white hover:bg-[color:var(--accent-strong)]",
        default:
          "border-transparent bg-[color:var(--accent)] px-4 py-2 text-white hover:bg-[color:var(--accent-strong)]",
        secondary:
          "border-[color:var(--border)] bg-white px-4 py-2 text-[color:var(--foreground)] hover:bg-slate-50",
        ghost:
          "border-transparent px-3 py-2 text-[color:var(--foreground)] hover:bg-slate-100",
        danger:
          "border-transparent bg-[color:var(--danger)] px-4 py-2 text-white hover:bg-[#8f3524]",
        destructive:
          "border-transparent bg-[color:var(--danger)] px-4 py-2 text-white hover:bg-[#8f3524]",
      },
      size: {
        default: "h-10",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps): JSX.Element {
  const Comp = asChild ? Slot : "button";

  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
