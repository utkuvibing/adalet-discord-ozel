import React from 'react';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { theme } from '../theme';

interface AvatarBadgeProps {
  displayName: string;
  profilePhotoUrl?: string | null;
  serverAddress?: string;
  size?: number;
}

export function AvatarBadge({ displayName, profilePhotoUrl, serverAddress = 'localhost:7432', size = 24 }: AvatarBadgeProps): React.JSX.Element {
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const resolvedPhotoUrl = resolveMediaUrl(profilePhotoUrl, serverAddress);

  if (resolvedPhotoUrl) {
    return (
      <img
        src={resolvedPhotoUrl}
        alt={displayName}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: `1px solid ${theme.colors.accentBorder}`,
          flexShrink: 0,
          backgroundColor: theme.colors.bgCard,
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: theme.colors.bgHover,
        color: theme.colors.textSecondary,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.floor(size * 0.42)),
        fontWeight: 700,
        border: `1px solid ${theme.colors.accentBorder}`,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
