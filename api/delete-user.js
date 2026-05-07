import { createClient } from '@supabase/supabase-js'

const requests = new Map()

function getSupabaseUrl() {
  return process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://aginagtxlavplmswywys.supabase.co'
}

function getSupabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function rateLimit(req, limit = 30, windowMs = 60_000) {
  const forwardedFor = req.headers['x-forwarded-for']
  const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0]?.trim()
  const key = ip || req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const entry = requests.get(key)

  if (!entry || entry.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  entry.count += 1
  return entry.count > limit
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' ? token : ''
}

function safeError(error) {
  console.error('delete-user:', error)
  return 'Nao foi possivel remover o usuario.'
}

async function requireAdmin(supabase, req) {
  const token = getBearerToken(req)
  if (!token) {
    const error = new Error('Nao autenticado')
    error.status = 401
    throw error
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData?.user?.id) {
    const error = new Error('Sessao invalida')
    error.status = 401
    throw error
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, role, salon_id')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError) throw profileError

  if (String(profile?.role ?? '').trim().toLowerCase() !== 'admin' || !profile?.salon_id) {
    const error = new Error('Acesso negado')
    error.status = 403
    throw error
  }

  return profile
}

export default async function handler(req, res) {
  setSecurityHeaders(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo nao permitido' })
  }

  if (rateLimit(req)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde um momento.' })
  }

  try {
    const { user_id, email } = req.body ?? {}
    const normalizedUserId = user_id?.trim()
    const normalizedEmail = email?.trim().toLowerCase()

    const supabaseUrl = getSupabaseUrl()
    const serviceKey = getSupabaseServiceKey()
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    }

    if (!normalizedUserId && !normalizedEmail) {
      return res.status(400).json({ error: 'Informe user_id ou email' })
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const adminProfile = await requireAdmin(supabase, req)

    const query = supabase
      .from('users')
      .select('id, email, role, salon_id')
      .eq('salon_id', adminProfile.salon_id)

    const { data: targetProfile, error: targetError } = normalizedUserId
      ? await query.eq('id', normalizedUserId).maybeSingle()
      : await query.eq('email', normalizedEmail).maybeSingle()

    if (targetError) throw targetError

    if (!targetProfile) {
      return res.status(200).json({ success: true, already_removed: true })
    }

    if (targetProfile.id === adminProfile.id || String(targetProfile.role ?? '').trim().toLowerCase() === 'admin') {
      return res.status(403).json({ error: 'Nao e permitido remover este usuario' })
    }

    const { error: authError } = await supabase.auth.admin.deleteUser(targetProfile.id)

    if (authError) {
      console.error('Erro AUTH delete-user:', authError)
      const authMessage = String(authError.message ?? '').toLowerCase()
      if (authMessage.includes('not found') || authMessage.includes('does not exist')) {
        return res.status(200).json({ success: true, already_removed: true })
      }
      return res.status(400).json({ error: 'Nao foi possivel remover o login.' })
    }

    const { error: dbError } = await supabase
      .from('users')
      .delete()
      .eq('id', targetProfile.id)
      .eq('salon_id', adminProfile.salon_id)

    if (dbError) {
      console.error('Erro DB delete-user:', dbError)
      return res.status(400).json({ error: 'Login removido, mas nao foi possivel remover o perfil.' })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    const status = err.status || 500
    return res.status(status).json({ error: status >= 500 ? safeError(err) : err.message })
  }
}
