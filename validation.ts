export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Keeps just the 10-digit Indian mobile number (drops +91 / 0 prefixes, spaces, dashes). */
export function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

export const isValidPhone = (p: string) => /^[0-9]{10}$/.test(p);
export const isValidPin = (p: string) => /^[1-9][0-9]{5}$/.test(p);

export function authMessage(raw: string): string {
  if (/invalid login credentials/i.test(raw)) return 'Wrong email or password.';
  if (/already registered|already been registered/i.test(raw))
    return 'An account with this email already exists. Please sign in instead.';
  if (/rate limit|too many/i.test(raw)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/network|fetch/i.test(raw)) return 'Network problem. Please check your internet connection.';
  if (/password/i.test(raw) && /(least|short|weak)/i.test(raw)) return 'Please choose a stronger password (at least 8 characters).';
  return raw;
}
