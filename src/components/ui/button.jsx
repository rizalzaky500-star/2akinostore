import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import {
  RippleButton,
  RippleButtonRipples,
} from '@animate-ui/react/primitives/buttons/ripple';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-red-600 text-white shadow-lg shadow-red-950/30 hover:bg-red-500',
        secondary: 'border border-white/10 bg-white/[0.06] text-zinc-200 hover:bg-white/10',
        ghost: 'text-zinc-400 hover:bg-white/[0.06] hover:text-white',
        success: 'bg-emerald-500 text-white hover:bg-emerald-400',
        danger: 'text-red-400 hover:bg-red-500/10 hover:text-red-300',
        unstyled: '',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 rounded-lg px-3 text-xs',
        icon: 'h-10 w-10',
        none: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = forwardRef(({ children, className, variant, size, ...props }, ref) => (
  <RippleButton
    ref={ref}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  >
    <span className="relative z-10 inline-flex items-center justify-center gap-2">
      {children}
    </span>
    <RippleButtonRipples color="rgba(255, 255, 255, 0.22)" className="z-0" />
  </RippleButton>
));
Button.displayName = 'Button';

export { Button, buttonVariants };
