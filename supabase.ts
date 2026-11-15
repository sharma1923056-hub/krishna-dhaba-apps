import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { createApi } from '@/api';
import { IS_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

// Placeholders keep the app from crashing on start when the build is missing its settings;
// the root screen shows a clear "not configured" message instead.
export const supabase = createClient(
  IS_CONFIGURED ? SUPABASE_URL : 'https://not-configured.invalid',
  IS_CONFIGURED ? SUPABASE_ANON_KEY : 'not-configured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh the login token only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export const api = createApi(supabase);
