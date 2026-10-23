import { forwardRef } from 'react';
import {
  RippleButton,
  RippleButtonRipples,
} from '@animate-ui/react/primitives/buttons/ripple';
import { cn } from '../lib/utils.js';

const StarBorder = forwardRef(
  ({ as: Component = RippleButton, children, className, animated = true, ...props }, ref) => (
    <Component
      ref={ref}
      className={cn(animated && 'star-border-button', 'relative isolate overflow-hidden', className)}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
      {Component === RippleButton && (
        <RippleButtonRipples color="rgba(255, 255, 255, 0.22)" className="z-0" />
      )}
    </Component>
  ),
);
StarBorder.displayName = 'StarBorder';

export { StarBorder };
