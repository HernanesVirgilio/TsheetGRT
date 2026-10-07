import React from 'react';

interface UserAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-base',
} as const;

function getInitials(name: string): string {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return initials || 'SI';
}

/** Decorativo: o nome é sempre apresentado em texto ao lado. */
export const UserAvatar: React.FC<UserAvatarProps> = ({ name, size = 'md' }) => (
  <span
    aria-hidden="true"
    className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-sidebar font-semibold text-white ${SIZE_CLASSES[size]}`}
  >
    {getInitials(name)}
  </span>
);
