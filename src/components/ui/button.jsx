import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';
import { StarBorder } from '../StarBorder.jsx';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'star-border-red bg-zinc-950 text-white shadow-lg shadow-red-950/30 hover:bg-zinc-900',
        secondary: 'star-border-neutral bg-zinc-950/90 text-zinc-200 hover:bg-zinc-900',
        ghost: 'star-border-neutral bg-zinc-950/70 text-zinc-400 hover:bg-zinc-900 hover:text-white',
        success: 'star-border-green bg-zinc-950 text-emerald-200 hover:bg-emerald-950/50',
        danger: 'star-border-red bg-zinc-950 text-red-300 hover:bg-red-950/50',
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

const Button = forwardRef(({ children, className, variant, size, as, ...props }, ref) => (
  <StarBorder
    as={as}
    animated={variant !== 'unstyled'}
    ref={ref}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  >
    {children}
  </StarBorder>
));
Button.displayName = 'Button';

export { Button, buttonVariants };
