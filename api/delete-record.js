import { createClient } from '@supabase/supabase-js'

const requests = new Map()
const allowedTables = new Set(['clients', 'employees', 'advances', 'audit_logs'])

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

function rateLimit(req, limit = 40, windowMs = 60_000) {
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
  console.error('delete-record:', error)
  return 'Nao foi possivel apagar o registro.'
}

function isUuid(id) {
  const text = String(id ?? '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
}

async function requireAdmin(supabase, req, salonId) {
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

  const isAdmin = String(profile?.role ?? '').trim().toLowerCase() === 'admin'
  const sameSalon = String(profile?.salon_id ?? '') === String(salonId)
  if (!isAdmin || !sameSalon) {
    const error = new Error('Acesso negado')
    error.status = 403
    throw error
  }

  return profile
}

async function deleteEmployeeLogin(supabase, employee, salonId) {
  const authUserId = employee?.user_id
  const loginEmail = employee?.login_email || employee?.email

  const { data: profile } = authUserId
    ? await supabase.from('users').select('id, role, salon_id').eq('id', authUserId).eq('salon_id', salonId).maybeSingle()
    : loginEmail
      ? await supabase.from('users').select('id, role, salon_id').eq('email', loginEmail).eq('salon_id', salonId).maybeSingle()
      : { data: null }

  if (!profile?.id || String(profile.role ?? '').trim().toLowerCase() === 'admin') return

  const { error: authError } = await supabase.auth.admin.deleteUser(profile.id)
  if (authError) {
    const message = String(authError.message ?? '').toLowerCase()
    if (!message.includes('not found') && !message.includes('does not exist')) throw authError
  }

  const { error: dbError } = await supabase
    .from('users')
    .delete()
    .eq('id', profile.id)
    .eq('salon_id', salonId)

  if (dbError) throw dbError
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
    const { salon_id, table, id } = req.body ?? {}
    const normalizedSalonId = salon_id?.trim?.() ?? salon_id
    const normalizedTable = String(table ?? '').trim()
    const normalizedId = id?.trim?.() ?? id

    const supabaseUrl = getSupabaseUrl()
    const serviceKey = getSupabaseServiceKey()
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    }

    if (!normalizedSalonId || !normalizedId || !allowedTables.has(normalizedTable)) {
      return res.status(400).json({ error: 'Informe salao, tabela e registro validos.' })
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    await requireAdmin(supabase, req, normalizedSalonId)

    if (normalizedTable === 'audit_logs') {
      if (!isUuid(normalizedId)) return res.status(400).json({ error: 'Registro de auditoria invalido.' })

      const { count, error: deleteAuditError } = await supabase
        .from('audit_logs')
        .delete({ count: 'exact' })
        .eq('id', normalizedId)
        .eq('salon_id', normalizedSalonId)

      if (deleteAuditError) {
        console.error('Erro DB delete audit log:', deleteAuditError)
        return res.status(400).json({ error: deleteAuditError.message || 'Nao foi possivel apagar o registro de auditoria.' })
      }

      return res.status(200).json({ success: true, deleted: count ?? 0 })
    }

    const { data: record, error: recordError } = await supabase
      .from(normalizedTable)
      .select('*')
      .eq('id', normalizedId)
      .eq('salon_id', normalizedSalonId)
      .maybeSingle()

    if (recordError) throw recordError
    if (!record) return res.status(404).json({ error: 'Registro nao encontrado neste salao.' })

    if (normalizedTable === 'employees') {
      await deleteEmployeeLogin(supabase, record, normalizedSalonId)
    }

    const { error: deleteError } = await supabase
      .from(normalizedTable)
      .delete()
      .eq('id', normalizedId)
      .eq('salon_id', normalizedSalonId)

    if (deleteError) throw deleteError

    return res.status(200).json({ success: true })
  } catch (err) {
    const status = err.status || 500
    return res.status(status).json({ error: status >= 500 ? safeError(err) : err.message })
  }
}
