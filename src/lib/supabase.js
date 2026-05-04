import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://aginagtxlavplmswywys.supabase.co'
const supabaseKey = 'sb_publishable_nUsYjuvT04LFXA1fxo1y1A_X9twygNo'

export const supabase = createClient(supabaseUrl, supabaseKey)

