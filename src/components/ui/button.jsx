import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import {
  RippleButton,
  RippleButtonRipples,
} from '@animate-ui/react/primitives/buttons/ripple';
import { cn } from '../../lib/utils.js';
import StarBorder from '../StarBorder.jsx';

const starBorderVariants = {
  default: {
    color: '#fecdd3',
    trailColor: '#fb7185',
    backgroundColor: '#dc2626',
    textColor: '#ffffff',
    borderColor: 'rgba(229, 9, 20, 0.38)',
  },
  secondary: {
    color: '#ffffff',
    trailColor: '#d4d4d8',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    textColor: '#e4e4e7',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  ghost: {
    color: '#e4e4e7',
    trailColor: '#a1a1aa',
    backgroundColor: 'transparent',
    textColor: '#a1a1aa',
    borderColor: 'rgba(161, 161, 170, 0.24)',
  },
  success: {
    color: '#a7f3d0',
    trailColor: '#6ee7b7',
    backgroundColor: '#10b981',
    textColor: '#ffffff',
    borderColor: 'rgba(16, 185, 129, 0.38)',
  },
  danger: {
    color: '#fca5a5',
    trailColor: '#f87171',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    textColor: '#f87171',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
};

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

const Button = forwardRef(({ children, className, variant, size, as, style, ...props }, ref) => {
  const selectedVariant = variant ?? 'default';
  const selectedSize = size ?? 'default';
  const componentClassName = cn(buttonVariants({ variant, size }), className);

  if (selectedVariant === 'unstyled') {
    return (
      <RippleButton ref={ref} className={componentClassName} {...props}>
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {children}
        </span>
        <RippleButtonRipples color="rgba(255, 255, 255, 0.22)" className="z-0" />
      </RippleButton>
    );
  }

  const radius = className?.includes('rounded-full') ? 999 : selectedSize === 'sm' ? 8 : 12;
  const padding = selectedSize === 'sm'
    ? '0 0.75rem'
    : selectedSize === 'icon' || selectedSize === 'none'
      ? '0'
      : '0 1.25rem';
  const fontSize = selectedSize === 'sm' ? '0.75rem' : '0.875rem';

  return (
    <StarBorder
      as={as ?? RippleButton}
      ref={ref}
      className={componentClassName}
      {...starBorderVariants[selectedVariant]}
      duration={3.5}
      thickness={1}
      radius={radius}
      trailLength={0.28}
      glow={0.55}
      hover="lap"
      sparkle={false}
      clickPulse
      theme="dark"
      style={{
        padding,
        fontSize,
        fontWeight: 600,
        lineHeight: 1.25,
        ...style,
      }}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
      {!as && (
        <RippleButtonRipples color="rgba(255, 255, 255, 0.22)" className="z-0" />
      )}
    </StarBorder>
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
