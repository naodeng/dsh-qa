export function filterSlashCapabilities(items, query, limit = 9) {
  const capabilities = Array.isArray(items) ? items : [];
  const needle = String(query ?? '').trim().toLowerCase();
  const maxResults = Math.max(0, Number(limit) || 0);
  if (!needle) return capabilities.slice(0, maxResults);

  const namePrefixMatches = [];
  const nameMatches = [];
  const descriptionMatches = [];

  for (const item of capabilities) {
    const name = String(item?.name ?? '').toLowerCase();
    if (name.startsWith(needle)) {
      namePrefixMatches.push(item);
    } else if (name.includes(needle)) {
      nameMatches.push(item);
    } else if (needle.length > 1 && String(item?.description ?? '').toLowerCase().includes(needle)) {
      descriptionMatches.push(item);
    }
  }

  return [...namePrefixMatches, ...nameMatches, ...descriptionMatches].slice(0, maxResults);
}
