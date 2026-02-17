export const normalizeImeNumericRaw = (rawValue: string): string => {
  if (!rawValue) return '';

  // Convert full-width digits and punctuation from CJK IME into ASCII.
  const ascii = rawValue
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/．/g, '.')
    .replace(/－/g, '-');

  return ascii;
};

