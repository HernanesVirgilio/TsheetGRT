import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover hover:text-white',
  secondary: 'border border-border-input bg-surface text-text hover:bg-surface-muted',
  danger: 'bg-danger text-white hover:bg-danger-hover',
  ghost: 'text-text-secondary hover:bg-surface-muted hover:text-text',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  isLoading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...buttonProps
}) => (
  <button
    type={type}
    disabled={disabled || isLoading}
    aria-busy={isLoading || undefined}
    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    {...buttonProps}
  >
    {isLoading ? <Spinner size="sm" /> : Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
    {children}
  </button>
);

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  tone?: 'neutral' | 'danger';
}

/** Botão compacto para ações em linha (tabelas). O rótulo é obrigatório para leitores de ecrã. */
export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  label,
  tone = 'neutral',
  type = 'button',
  className = '',
  ...buttonProps
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      tone === 'danger' ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-surface-muted hover:text-text'
    } ${className}`}
    {...buttonProps}
  >
    <Icon className="h-4 w-4" aria-hidden="true" />
  </button>
);
