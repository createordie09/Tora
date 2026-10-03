import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 border border-transparent text-white',
  secondary: 'bg-surface-1 hover:bg-surface-2 border border-line-strong text-muted hover:text-white',
  danger: 'bg-red-700 hover:bg-red-600 border border-red-600 text-white',
  ghost: 'bg-transparent hover:bg-white/10 border border-transparent text-muted hover:text-white',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-10 px-4 text-[13px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** The one button style of the interface: pick a variant instead of re-typing colours per screen. */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', className = '', type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
});

export default Button;
