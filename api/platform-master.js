import { createClient } from '@supabase/supabase-js'

const PREMIUM_AMOUNT = 49.90
const allowedSalonStatus = new Set(['ativo', 'inativo', 'suspenso'])
const allowedUserRoles = new Set(['platform_owner', 'admin', 'caixa', 'profissional'])
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

function rateLimit(req, limit = 60, windowMs = 60_000) {
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

function normalizeStatus(status, fallback = 'ativo') {
  const normalized = String(status ?? fallback).trim().toLowerCase()
  return allowedSalonStatus.has(normalized) ? normalized : fallback
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

function isUuid(id) {
  const text = String(id ?? '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
}

function safeError(error) {
  console.error('platform-master:', error)
  return 'Nao foi possivel executar a acao do painel master.'
}

function isMissingTableError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('relation') ||
    message.includes('does not exist')
}

async function findAuthUserByEmail(supabase, email) {
  const normalizedEmail = normalizeEmail(email)

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const user = data?.users?.find((item) => normalizeEmail(item.email) === normalizedEmail)
    if (user) return user
    if ((data?.users?.length ?? 0) < 1000) return null
  }

  return null
}

function isAlreadyRegisteredError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user already exists') ||
    message.includes('email_exists')
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

async function requirePlatformOwner(supabase, req) {
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
    .select('id, email, name, role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError) throw profileError

  if (String(profile?.role ?? '').trim().toLowerCase() !== 'platform_owner') {
    const error = new Error('Acesso negado')
    error.status = 403
    throw error
  }

  return profile
}

async function writePlatformAudit(supabase, owner, action, details = {}, salonId = null) {
  const payload = {
    salon_id: salonId,
    user_id: owner?.id ?? null,
    user_name: owner?.name ?? owner?.email ?? 'platform_owner',
    action,
    entity_type: 'platform',
    entity_id: salonId ? String(salonId) : null,
    new_data: details,
    reason: details.reason ?? 'Acao executada pelo Painel da Plataforma',
    created_at: new Date().toISOString()
  }

  const { error } = await supabase.from('audit_logs').insert(payload)
  if (error) console.error('platform audit failed:', error)
}

async function fetchPlatformData(supabase) {
  const [
    salonsResult,
    subscriptionsResult,
    usersResult,
    clientsResult,
    employeesResult,
    cashResult,
    appointmentsResult,
    auditResult
  ] = await Promise.all([
    supabase.from('salons').select('*').order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('*'),
    supabase.from('users').select('id, salon_id, email, name, role, created_at, last_login_at, login_active'),
    supabase.from('clients').select('id, salon_id'),
    supabase.from('employees').select('id, salon_id, active, login_active'),
    supabase.from('cash_movements').select('id, salon_id, amount, service_value, salon_value, status, payment_status, type, date, created_at'),
    supabase.from('appointments').select('id, salon_id, appointment_date, status, price'),
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(30)
  ])

  const results = [salonsResult, subscriptionsResult, usersResult, clientsResult, employeesResult, cashResult, appointmentsResult, auditResult]
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error

  const subscriptions = subscriptionsResult.data ?? []
  const users = usersResult.data ?? []
  const clients = clientsResult.data ?? []
  const employees = employeesResult.data ?? []
  const cashRows = cashResult.data ?? []
  const appointments = appointmentsResult.data ?? []

  const salons = (salonsResult.data ?? []).map((salon) => {
    const subscription = subscriptions.find((item) => String(item.salon_id) === String(salon.id))
    const salonUsers = users.filter((item) => String(item.salon_id ?? '') === String(salon.id))
    const admin = salonUsers.find((item) => String(item.role).toLowerCase() === 'admin')
    const salonClients = clients.filter((item) => String(item.salon_id ?? '') === String(salon.id))
    const salonEmployees = employees.filter((item) => String(item.salon_id ?? '') === String(salon.id))
    const salonCash = cashRows.filter((item) => String(item.salon_id ?? '') === String(salon.id))
    const revenue = salonCash.reduce((sum, item) => {
      const status = String(item.status ?? item.payment_status ?? '').toLowerCase()
      const type = String(item.type ?? '').toLowerCase()
      if (status === 'cancelado' || type === 'saida') return sum
      return sum + Number(item.amount ?? item.service_value ?? 0)
    }, 0)

    return {
      ...salon,
      admin_name: admin?.name ?? '',
      admin_email: admin?.email ?? '',
      subscription_status: subscription?.status ?? salon.subscription_status ?? 'ativo',
      subscription_amount: Number(subscription?.amount ?? PREMIUM_AMOUNT),
      next_due_date: subscription?.next_due_date ?? salon.subscription_due_date ?? null,
      employees_count: salonEmployees.length,
      clients_count: salonClients.length,
      users_count: salonUsers.length,
      revenue,
      subscription
    }
  })

  const activeSalons = salons.filter((salon) => salon.subscription_status === 'ativo')
  const suspendedSalons = salons.filter((salon) => salon.subscription_status === 'suspenso')
  const totalRevenue = salons.reduce((sum, salon) => sum + Number(salon.revenue ?? 0), 0)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
  const createdThisMonth = salons.filter((salon) => String(salon.created_at ?? '').startsWith(currentMonth)).length
  const createdPreviousMonth = salons.filter((salon) => String(salon.created_at ?? '').startsWith(previousMonth)).length
  const monthlyGrowth = createdPreviousMonth ? ((createdThisMonth - createdPreviousMonth) / createdPreviousMonth) * 100 : createdThisMonth * 100

  return {
    metrics: {
      total_salons: salons.length,
      active_salons: activeSalons.length,
      suspended_salons: suspendedSalons.length,
      total_users: users.length,
      total_clients: clients.length,
      total_revenue: totalRevenue,
      total_appointments: appointments.length,
      monthly_growth: monthlyGrowth
    },
    salons,
    users,
    latest_salons: salons.slice(0, 6),
    latest_logins: users
      .filter((user) => user.last_login_at)
      .sort((a, b) => String(b.last_login_at).localeCompare(String(a.last_login_at)))
      .slice(0, 8),
    top_salons: [...salons].sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 8),
    audit_logs: auditResult.data ?? []
  }
}

async function createSalon(supabase, owner, body) {
  const salonName = String(body.salon_name ?? body.name ?? '').trim()
  const whatsapp = String(body.whatsapp ?? '').trim()
  const adminName = String(body.admin_name ?? body.owner_name ?? '').trim()
  const adminEmail = normalizeEmail(body.admin_email)
  const temporaryPassword = String(body.temporary_password ?? '').trim()
  const status = normalizeStatus(body.status, 'ativo')
  const nextDueDate = body.next_due_date || null

  if (!salonName || !adminName || !adminEmail || !temporaryPassword) {
    const error = new Error('Informe salao, dono, e-mail e senha temporaria.')
    error.status = 400
    throw error
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    const error = new Error('E-mail do admin invalido.')
    error.status = 400
    throw error
  }

  if (temporaryPassword.length < 8) {
    const error = new Error('A senha temporaria precisa ter pelo menos 8 caracteres.')
    error.status = 400
    throw error
  }

  const { data: salon, error: salonError } = await supabase
    .from('salons')
    .insert({
      name: salonName,
      whatsapp,
      subscription_status: status,
      subscription_due_date: nextDueDate
    })
    .select('*')
    .single()

  if (salonError) throw salonError

  let authUser
  try {
    authUser = await createOrReuseAuthUser(supabase, { email: adminEmail, password: temporaryPassword })

    const { error: userError } = await supabase.from('users').upsert({
      id: authUser.id,
      salon_id: salon.id,
      email: adminEmail,
      name: adminName,
      role: 'admin',
      login_active: true
    })
    if (userError) throw userError

    const { error: subscriptionError } = await supabase.from('subscriptions').insert({
      salon_id: salon.id,
      status,
      amount: PREMIUM_AMOUNT,
      next_due_date: nextDueDate
    })
    if (subscriptionError) throw subscriptionError

    await writePlatformAudit(supabase, owner, 'criacao_salao', { salon_name: salonName, admin_email: adminEmail }, salon.id)
    return { salon_id: salon.id }
  } catch (error) {
    await supabase.from('salons').delete().eq('id', salon.id)
    if (authUser?.id) await supabase.auth.admin.deleteUser(authUser.id)
    throw error
  }
}

async function updateSalonStatus(supabase, owner, body) {
  const salonId = body.salon_id
  const status = normalizeStatus(body.status)
  if (!salonId) {
    const error = new Error('Informe o salao.')
    error.status = 400
    throw error
  }

  const { error: salonError } = await supabase
    .from('salons')
    .update({ subscription_status: status, updated_at: new Date().toISOString() })
    .eq('id', salonId)
  if (salonError) throw salonError

  const { error: subscriptionError } = await supabase
    .from('subscriptions')
    .upsert({ salon_id: salonId, status, amount: PREMIUM_AMOUNT, updated_at: new Date().toISOString() }, { onConflict: 'salon_id' })
  if (subscriptionError) throw subscriptionError

  await writePlatformAudit(supabase, owner, status === 'suspenso' ? 'suspensao_salao' : 'ativacao_salao', { status }, salonId)
  return { success: true }
}

async function deleteSalon(supabase, owner, body) {
  const salonId = body.salon_id
  if (!salonId) {
    const error = new Error('Informe o salao.')
    error.status = 400
    throw error
  }

  const { data: profiles, error: profilesError } = await supabase.from('users').select('id, role').eq('salon_id', salonId)
  if (profilesError) throw profilesError

  const targetProfiles = (profiles ?? []).filter((profile) => String(profile.role).toLowerCase() !== 'platform_owner')
  for (const profile of targetProfiles) {
    if (isUuid(profile.id)) {
      const { error: authError } = await supabase.auth.admin.deleteUser(profile.id)
      if (authError && !String(authError.message ?? '').toLowerCase().includes('not found')) throw authError
    }
  }

  await writePlatformAudit(supabase, owner, 'exclusao_salao', { salon_id: salonId }, salonId)
  const tables = ['subscriptions', 'session_logs', 'login_attempts', 'backup_logs', 'audit_logs', 'cash_closures', 'employee_commission_payments', 'commission_payments', 'cash_movements', 'advances', 'appointments', 'stock_items', 'services', 'clients', 'employees', 'users']
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('salon_id', salonId)
    if (error && !isMissingTableError(error)) throw error
  }

  const { error: salonError } = await supabase.from('salons').delete().eq('id', salonId)
  if (salonError) throw salonError
  return { success: true }
}

async function updateUserLogin(supabase, owner, body) {
  const userId = body.user_id
  const active = Boolean(body.active)
  if (!userId) {
    const error = new Error('Informe o usuario.')
    error.status = 400
    throw error
  }

  const { data: profile, error: profileError } = await supabase.from('users').select('id, salon_id, role').eq('id', userId).maybeSingle()
  if (profileError) throw profileError
  if (!profile || !allowedUserRoles.has(String(profile.role).toLowerCase())) {
    const error = new Error('Usuario invalido.')
    error.status = 400
    throw error
  }

  const { error } = await supabase.from('users').update({ login_active: active }).eq('id', userId)
  if (error) throw error

  await writePlatformAudit(supabase, owner, active ? 'ativacao_login' : 'desativacao_login', { user_id: userId }, profile.salon_id)
  return { success: true }
}

async function resetPassword(supabase, owner, body) {
  const userId = body.user_id
  const password = String(body.temporary_password ?? '').trim()
  if (!userId || password.length < 8) {
    const error = new Error('Informe usuario e senha temporaria com pelo menos 8 caracteres.')
    error.status = 400
    throw error
  }

  const { data: profile, error: profileError } = await supabase.from('users').select('id, salon_id').eq('id', userId).maybeSingle()
  if (profileError) throw profileError
  if (!profile) {
    const error = new Error('Usuario nao encontrado.')
    error.status = 404
    throw error
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { password })
  if (error) throw error

  await writePlatformAudit(supabase, owner, 'redefinicao_senha', { user_id: userId }, profile.salon_id)
  return { success: true }
}

async function accessSalon(supabase, owner, body) {
  const salonId = body.salon_id
  if (!salonId) {
    const error = new Error('Informe o salao.')
    error.status = 400
    throw error
  }

  await writePlatformAudit(supabase, owner, 'acesso_dono_salao', { salon_id: salonId }, salonId)
  return { success: true, salon_id: salonId }
}

async function exportPlatform(supabase, owner, body) {
  await writePlatformAudit(supabase, owner, 'exportacao_plataforma', { format: body.format ?? 'arquivo' }, null)
  return { success: true }
}

export default async function handler(req, res) {
  setSecurityHeaders(res)

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Metodo nao permitido' })
  }

  if (rateLimit(req)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde um momento.' })
  }

  try {
    const supabaseUrl = getSupabaseUrl()
    const serviceKey = getSupabaseServiceKey()
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
    const owner = await requirePlatformOwner(supabase, req)

    if (req.method === 'GET') {
      const data = await fetchPlatformData(supabase)
      return res.status(200).json(data)
    }

    const action = String(req.body?.action ?? '').trim()
    const handlers = {
      create_salon: createSalon,
      update_salon_status: updateSalonStatus,
      delete_salon: deleteSalon,
      update_user_login: updateUserLogin,
      reset_password: resetPassword,
      access_salon: accessSalon,
      export_platform: exportPlatform
    }

    if (!handlers[action]) {
      return res.status(400).json({ error: 'Acao invalida.' })
    }

    const result = await handlers[action](supabase, owner, req.body ?? {})
    return res.status(200).json(result)
  } catch (err) {
    const status = err.status || 500
    return res.status(status).json({ error: status >= 500 ? safeError(err) : err.message })
  }
}
