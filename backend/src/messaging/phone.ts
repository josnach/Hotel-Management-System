/**
 * Normalise a phone number to WhatsApp's format: digits only, country code first, no "+".
 * Nigerian formats (0803…, 803…, 234803…, +234 803…) are handled; any other country
 * must be typed with a leading "+" or "00" so we never guess a country code.
 */
export function toWaNumber(raw: string): string | null {
  const t = raw.trim();
  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  if (t.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (digits.startsWith('00')) { const x = digits.slice(2); return x.length >= 8 && x.length <= 15 ? x : null; }
  if (digits.startsWith('234') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`;
  return null;
}

/** True when two stored/received numbers refer to the same subscriber (compares the last 10 digits). */
export const samePhone = (a: string, b: string) => {
  const x = a.replace(/\D/g, ''), y = b.replace(/\D/g, '');
  return x.length >= 7 && y.length >= 7 && x.slice(-10) === y.slice(-10);
};
