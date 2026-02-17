import { createClient } from '@supabase/supabase-js';

// 這裡先用空字串防呆，真正的連線會在 Vercel 環境變數中設定
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
