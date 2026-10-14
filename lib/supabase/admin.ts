import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role: bypass RLS. Hanya dipakai di server (route handler /
// server component) yang sudah cek role + kepemilikan sendiri di kode.
// Jangan pernah expose ke client.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )
}
