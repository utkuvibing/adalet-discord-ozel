// Preset avatar definitions — shared by renderer and server.
// RULE: No imports from 'electron', 'better-sqlite3', or 'node:*'.

export type AvatarId =
  | 'skull'
  | 'dragon'
  | 'sword'
  | 'shield'
  | 'crown'
  | 'ghost'
  | 'alien'
  | 'robot'
  | 'wizard'
  | 'fire'
  | 'lightning'
  | 'gem';

export interface AvatarDef {
  id: AvatarId;
  label: string;
  emoji: string;
}

export const AVATARS: AvatarDef[] = [
  { id: 'skull', label: 'Skull', emoji: '\u{1F480}' },
  { id: 'dragon', label: 'Dragon', emoji: '\u{1F409}' },
  { id: 'sword', label: 'Sword', emoji: '\u{2694}\u{FE0F}' },
  { id: 'shield', label: 'Shield', emoji: '\u{1F6E1}\u{FE0F}' },
  { id: 'crown', label: 'Crown', emoji: '\u{1F451}' },
  { id: 'ghost', label: 'Ghost', emoji: '\u{1F47B}' },
  { id: 'alien', label: 'Alien', emoji: '\u{1F47E}' },
  { id: 'robot', label: 'Robot', emoji: '\u{1F916}' },
  { id: 'wizard', label: 'Wizard', emoji: '\u{1F9D9}' },
  { id: 'fire', label: 'Fire', emoji: '\u{1F525}' },
  { id: 'lightning', label: 'Lightning', emoji: '\u{26A1}' },
  { id: 'gem', label: 'Gem', emoji: '\u{1F48E}' },
];

/** Look up the emoji for a given avatar ID, with fallback. */
export function getAvatarEmoji(id: AvatarId | string): string {
  return AVATARS.find((a) => a.id === id)?.emoji ?? '\u{1F47E}'; // fallback: alien monster
}
