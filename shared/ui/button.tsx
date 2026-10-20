import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/utils';

/**
 * Actions take a 12px radius (DESIGN.md); `shape="pill"` is for chip-like
 * quick actions in the chrome. Violet fills the one primary action on a
 * surface and every other variant stays quieter. No variant carries a shadow:
 * elevation is reserved for overlays that genuinely float. A press scales to
 * 0.96, only where motion is allowed and never while disabled.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 text-sm font-medium whitespace-nowrap outline-none transition-[color,background-color,border-color,scale] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 motion-safe:enabled:active:scale-[0.96] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'border-border bg-card text-foreground hover:bg-muted border',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-primary-subtle',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        /** Violet tint, for secondary actions that are still on-brand. */
        accent: 'bg-primary-subtle text-primary-subtle-foreground hover:bg-primary/15',
        link: 'link',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-danger',
      },
      size: {
        default: 'h-10 px-5 py-2 has-[>svg]:px-4',
        sm: 'h-8 gap-1.5 px-3.5 text-xs has-[>svg]:px-3',
        lg: 'h-11 px-6 has-[>svg]:px-5',
        icon: 'size-10',
      },
      shape: {
        default: 'rounded-xl',
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>`, keeping the styles. */
  asChild?: boolean;
}

function Button({ className, variant, size, shape, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
