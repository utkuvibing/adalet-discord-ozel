import React from 'react';
import { resolveMediaUrl } from '../utils/mediaUrl';

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
          border: '1px solid #333',
          flexShrink: 0,
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
        backgroundColor: '#1f2430',
        color: '#c7d0df',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.floor(size * 0.42)),
        fontWeight: 700,
        border: '1px solid #333',
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
