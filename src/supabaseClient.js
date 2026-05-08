import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function upsertGameLog(log) {
  const { data: existing } = await supabase
    .from('game_logs')
    .select('id')
    .eq('user_id', log.user_id)
    .eq('game_id', String(log.game_id))
    .maybeSingle();

  if (existing) {
    return supabase.from('game_logs').update(log).eq('id', existing.id);
  }
  return supabase.from('game_logs').insert([log]);
}
