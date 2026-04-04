import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kemgwuzpcclxsknuxaub.supabase.co';
// The user needs to provide this in their environment
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
