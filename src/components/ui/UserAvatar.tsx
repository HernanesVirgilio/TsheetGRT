import React from 'react';

interface UserAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, size = 'md' }) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SI';

  const sizeStyles = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-base font-semibold',
  };

  return (
    <div
      className={`inline-flex items-center justify-center rounded bg-[#1F5FAD] text-white font-medium select-none shadow-2xs ${sizeStyles[size]}`}
      title={name}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
