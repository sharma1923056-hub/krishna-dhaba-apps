// Values are injected at build time (see .env.example / GitHub secrets).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const RESTAURANT_SLUG = process.env.EXPO_PUBLIC_RESTAURANT_SLUG ?? 'krishna-dhaba';

export const IS_CONFIGURED = /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 10;

/** Public URL of an image stored in the 'menu-images' bucket. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path || !IS_CONFIGURED) return null;
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/menu-images/${path}`;
}
