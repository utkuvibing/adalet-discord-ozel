export function resolveMediaUrl(
  pathOrUrl: string | null | undefined,
  serverAddress: string
): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const base = /^https?:\/\//.test(serverAddress)
    ? serverAddress
    : `http://${serverAddress}`;
  if (pathOrUrl.startsWith('/')) return `${base}${pathOrUrl}`;
  return `${base}/${pathOrUrl}`;
}
