const regionDisplay =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function isValidRegionCode(code: string): boolean {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return false;
  if (!regionDisplay) return false;
  const name = regionDisplay.of(upper);
  return !!name && name.toUpperCase() !== upper;
}

function codeToFlag(code: string): string {
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + (upper.charCodeAt(0) - 65),
    0x1f1e6 + (upper.charCodeAt(1) - 65)
  );
}

export function normalizeCountryCodeFlagsInText(text: string): string {
  if (!text) return text;

  const withShortcodes = text.replace(/:([a-z]{2}):/gi, (full, code: string) => {
    const upper = code.toUpperCase();
    return isValidRegionCode(upper) ? codeToFlag(upper) : full;
  });

  return withShortcodes.replace(/\b([A-Z]{2})\b/g, (full, code: string) => {
    return isValidRegionCode(code) ? codeToFlag(code) : full;
  });
}

