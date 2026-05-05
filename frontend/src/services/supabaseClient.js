import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'fg_system_auth_token', // explicit key prevents collision & accidental clearing
    storage: {
      // Custom storage wrapper: silently handles any storage errors (e.g. private mode, Android clearing)
      getItem: (key) => {
        try { return localStorage.getItem(key) } catch { return null }
      },
      setItem: (key, value) => {
        try { localStorage.setItem(key, value) } catch {}
      },
      removeItem: (key) => {
        try { localStorage.removeItem(key) } catch {}
      },
    }
  }
})
