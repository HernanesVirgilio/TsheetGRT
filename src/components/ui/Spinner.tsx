import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md';
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md' }) => (
  <span
    aria-hidden="true"
    className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${
      size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'
    }`}
  />
);
