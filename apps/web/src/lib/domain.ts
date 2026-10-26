export function normalizeDomain(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    return url.hostname.toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }
}

export function normalizeDomains(values: string[]) {
  return Array.from(new Set(values.map(normalizeDomain).filter(Boolean)));
}
