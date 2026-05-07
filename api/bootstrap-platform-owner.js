import { createClient } from '@supabase/supabase-js'

const platformOwnerLogin = 'douglasnobrega'
const platformOwnerEmail = 'douglasnobrega@salaopro.com'

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

function getBootstrapSecret(req) {
  return req.headers['x-bootstrap-secret'] || req.body?.bootstrap_secret
}

function isAlreadyRegisteredError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user already exists') ||
    message.includes('email_exists')
}

async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const user = data?.users?.find((item) => item.email?.trim().toLowerCase() === email)
    if (user) return user
    if ((data?.users?.length ?? 0) < 1000) return null
  }
  return null
}

export default async function handler(req, res) {
  setSecurityHeaders(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Metodo nao permitido' })
  }

  try {
    const expectedSecret = process.env.PLATFORM_BOOTSTRAP_SECRET
    if (!expectedSecret || getBootstrapSecret(req) !== expectedSecret) {
      return res.status(403).json({ error: 'Bootstrap nao autorizado.' })
    }

    const password = String(req.body?.password ?? '').trim()
    if (password.length < 8) {
      return res.status(400).json({ error: 'Informe uma senha com pelo menos 8 caracteres.' })
    }

    const supabaseUrl = getSupabaseUrl()
    const serviceKey = getSupabaseServiceKey()
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    let authUser
    const { data, error } = await supabase.auth.admin.createUser({
      email: platformOwnerEmail,
      password,
      email_confirm: true
    })

    if (!error) {
      authUser = data?.user
    } else if (isAlreadyRegisteredError(error)) {
      authUser = await findAuthUserByEmail(supabase, platformOwnerEmail)
      if (!authUser?.id) throw error
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true
      })
      if (updateError) throw updateError
    } else {
      throw error
    }

    const { error: profileError } = await supabase.from('users').upsert({
      id: authUser.id,
      email: platformOwnerEmail,
      username: platformOwnerLogin,
      name: 'Douglas Nobrega',
      role: 'platform_owner',
      salon_id: null,
      login_active: true
    })

    if (profileError) throw profileError

    return res.status(200).json({ success: true, login: platformOwnerLogin })
  } catch (error) {
    console.error('bootstrap-platform-owner:', error)
    return res.status(500).json({ error: 'Nao foi possivel criar o dono da plataforma.' })
  }
}
