import { createClient } from '@supabase/supabase-js'

const allowedRoles = new Set(['caixa', 'cashier', 'profissional', 'professional'])
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

function rateLimit(req, limit = 20, windowMs = 60_000) {
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
  console.error('create-user:', error)
  return 'Nao foi possivel criar o usuario.'
}

function isAlreadyRegisteredError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user already exists') ||
    message.includes('email_exists')
}

async function findAuthUserByEmail(supabase, email) {
  const normalizedEmail = email.trim().toLowerCase()

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const user = data?.users?.find((item) => item.email?.trim().toLowerCase() === normalizedEmail)
    if (user) return user
    if ((data?.users?.length ?? 0) < 1000) return null
  }

  return null
}

async function createOrReuseAuthUser(supabase, { email, password }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (!error) return data?.user ?? null
  if (!isAlreadyRegisteredError(error)) throw error

  const existingUser = await findAuthUserByEmail(supabase, email)
  if (!existingUser?.id) throw error

  const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
    password,
    email_confirm: true
  })
  if (updateError) throw updateError

  return existingUser
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
    const { email, password, name, salon_id, role } = req.body ?? {}
    const normalizedEmail = email?.trim().toLowerCase()
    const normalizedName = name?.trim()
    const normalizedSalonId = salon_id?.trim?.() ?? salon_id
    const normalizedRole = role === 'caixa' || role === 'cashier' ? 'caixa' : 'profissional'

    const supabaseUrl = getSupabaseUrl()
    const serviceKey = getSupabaseServiceKey()
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    }

    if (!normalizedEmail || !password || !normalizedName || !normalizedSalonId) {
      return res.status(400).json({ error: 'Informe e-mail, senha, nome e salao' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'E-mail invalido' })
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres' })
    }

    if (!allowedRoles.has(String(role ?? '').trim().toLowerCase())) {
      return res.status(400).json({ error: 'Perfil de usuario invalido' })
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    await requireAdmin(supabase, req, normalizedSalonId)

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('id, email, role, salon_id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingProfileError) throw existingProfileError
    if (existingProfile && String(existingProfile.salon_id ?? '') !== String(normalizedSalonId)) {
      return res.status(409).json({ error: 'Este e-mail ja pertence a outro salao.' })
    }
    if (String(existingProfile?.role ?? '').trim().toLowerCase() === 'admin') {
      return res.status(409).json({ error: 'Este e-mail pertence a um admin.' })
    }

    let authUser
    try {
      authUser = await createOrReuseAuthUser(supabase, {
        email: normalizedEmail,
        password
      })
    } catch (authError) {
      console.error('Erro AUTH create-user:', authError)
      return res.status(400).json({ error: authError.message || 'Nao foi possivel criar o login.' })
    }

    if (!authUser?.id) {
      return res.status(500).json({ error: 'Auth nao retornou usuario criado' })
    }

    const userProfile = {
      id: authUser.id,
      email: normalizedEmail,
      name: normalizedName,
      role: normalizedRole,
      salon_id: normalizedSalonId
    }

    const profileQuery = existingProfile
      ? supabase.from('users').update(userProfile).eq('email', normalizedEmail)
      : supabase.from('users').insert(userProfile)

    const { error: dbError } = await profileQuery

    if (dbError) {
      console.error('Erro DB create-user:', dbError)
      if (!existingProfile) await supabase.auth.admin.deleteUser(authUser.id)
      return res.status(400).json({ error: dbError.message || 'Nao foi possivel salvar o perfil do usuario.' })
    }

    return res.status(200).json({ success: true, user_id: authUser.id })
  } catch (err) {
    const status = err.status || 500
    return res.status(status).json({ error: status >= 500 ? safeError(err) : err.message })
  }
}
