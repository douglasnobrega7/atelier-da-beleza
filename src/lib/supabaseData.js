import { supabase } from './supabase'

export const TABLES = {
  salons: 'salons',
  users: 'users',
  clients: 'clients',
  employees: 'employees',
  services: 'services',
  appointments: 'appointments',
  cashMovements: 'cash_movements',
  advances: 'advances',
  stockItems: 'stock_items'
}

export const databaseNotConfiguredMessage = 'Banco ainda não configurado para esta tela.'

export function isMissingTableError(error) {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ''
  return error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('relation') ||
    message.includes('does not exist')
}

function requireSalonId(salonId) {
  if (!salonId) {
    const error = new Error(databaseNotConfiguredMessage)
    error.notConfigured = true
    throw error
  }
}

async function runQuery(query) {
  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error)) {
      const friendlyError = new Error(databaseNotConfiguredMessage)
      friendlyError.notConfigured = true
      friendlyError.original = error
      throw friendlyError
    }
    throw error
  }
  return data
}

function bySalon(table, salonId) {
  requireSalonId(salonId)
  return supabase.from(table).select('*').eq('salon_id', salonId)
}

function withSalon(payload, salonId) {
  requireSalonId(salonId)
  return { ...toSnakePayload(payload), salon_id: salonId }
}

function toSnakeKey(key) {
  const special = {
    lastVisit: 'last_visit',
    employeeType: 'employee_type',
    workStatus: 'work_status',
    workStart: 'work_start',
    workEnd: 'work_end',
    breakStart: 'break_start',
    breakEnd: 'break_end',
    defaultDuration: 'default_duration',
    scheduleInterval: 'schedule_interval',
    serviceCommissions: 'service_commissions',
    accessEmail: 'access_email',
    temporaryPassword: 'temporary_password',
    loginActive: 'login_active',
    paymentMethod: 'payment_method'
  }
  return special[key] ?? key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toSnakePayload(payload = {}) {
  return Object.entries(payload).reduce((acc, [key, value]) => {
    acc[toSnakeKey(key)] = value
    return acc
  }, {})
}

function isAdminProfile(profile) {
  return String(profile?.role ?? '').trim().toLowerCase() === 'admin'
}

export async function fetchUserProfileById(id) {
  const data = await runQuery(
    supabase
      .from(TABLES.users)
      .select('*')
      .eq('id', id)
      .maybeSingle()
  )
  return data
}

export async function createUserProfile(authUser) {
  return runQuery(
    supabase
      .from(TABLES.users)
      .insert({
        id: authUser.id,
        email: authUser.email,
        name: 'Admin',
        role: 'admin',
        salon_id: null
      })
      .select()
      .single()
  )
}

export async function createSalonForAdmin(profile, authUser) {
  const salon = await runQuery(
    supabase
      .from(TABLES.salons)
      .insert({ name: 'Meu Salão' })
      .select('*')
      .single()
  )

  console.log('Salão criado:', salon)

  const updatedProfile = await runQuery(
    supabase
      .from(TABLES.users)
      .update({ salon_id: salon.id })
      .eq('id', profile?.id ?? authUser.id)
      .select('*')
      .single()
  )

  console.log('User atualizado:', updatedProfile)

  return { salon, profile: updatedProfile }
}

export async function ensureAdminSalon(profile, authUser) {
  if (profile?.salon_id || !isAdminProfile(profile)) return profile
  const { profile: updatedProfile } = await createSalonForAdmin(profile, authUser)
  return updatedProfile
}

export async function createEmployeeUserProfile(salonId, payload) {
  requireSalonId(salonId)

  const email = payload.email?.trim().toLowerCase()
  if (!email) {
    throw new Error('E-mail do funcionário não informado.')
  }

  const role = payload.role === 'cashier' ? 'caixa' : 'profissional'

  const existing = await runQuery(
    supabase
      .from(TABLES.users)
      .select('*')
      .eq('email', email)
      .maybeSingle()
  )

  const userPayload = {
    email,
    name: payload.name,
    role,
    salon_id: salonId
  }

  if (existing) {
    return runQuery(
      supabase
        .from(TABLES.users)
        .update(userPayload)
        .eq('id', existing.id)
        .eq('salon_id', salonId)
        .select('*')
        .single()
    )
  }

  return runQuery(
    supabase
      .from(TABLES.users)
      .insert(userPayload)
      .select('*')
      .single()
  )
}

export async function fetchSalon(salonId) {
  requireSalonId(salonId)
  return runQuery(supabase.from(TABLES.salons).select('*').eq('id', salonId).maybeSingle())
}

export async function fetchClients(salonId) {
  return runQuery(bySalon(TABLES.clients, salonId).order('name', { ascending: true }))
}

export async function createClient(salonId, payload) {
  return runQuery(supabase.from(TABLES.clients).insert(withSalon(payload, salonId)).select('*').single())
}

export async function updateClient(salonId, id, payload) {
  return runQuery(supabase.from(TABLES.clients).update(toSnakePayload(payload)).eq('id', id).eq('salon_id', salonId).select('*').single())
}

export async function deleteClient(salonId, id) {
  return runQuery(supabase.from(TABLES.clients).delete().eq('id', id).eq('salon_id', salonId))
}

export async function fetchEmployees(salonId) {
  return runQuery(bySalon(TABLES.employees, salonId).order('name', { ascending: true }))
}

export async function createEmployee(salonId, payload) {
  return runQuery(supabase.from(TABLES.employees).insert(withSalon(payload, salonId)).select('*').single())
}

export async function updateEmployee(salonId, id, payload) {
  return runQuery(supabase.from(TABLES.employees).update(toSnakePayload(payload)).eq('id', id).eq('salon_id', salonId).select('*').single())
}

export async function deleteEmployee(salonId, id) {
  return runQuery(supabase.from(TABLES.employees).delete().eq('id', id).eq('salon_id', salonId))
}

function getSeedTodayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - (offset * 60 * 1000)).toISOString().slice(0, 10)
}

function getSeedNextAvailableTime() {
  const now = new Date()
  const rounded = new Date(now)
  const nextHalfHour = Math.ceil((now.getMinutes() + 1) / 30) * 30
  rounded.setMinutes(nextHalfHour, 0, 0)

  if (rounded.getHours() < 9 || rounded.getHours() >= 18) return '09:00'
  return `${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`
}

export async function seedSalonData(salonId) {
  requireSalonId(salonId)

  const existingEmployees = await runQuery(
    supabase
      .from(TABLES.employees)
      .select('id')
      .eq('salon_id', salonId)
  )

  if ((existingEmployees?.length ?? 0) > 0) {
    return { created: false }
  }

  const today = getSeedTodayIso()
  const time = getSeedNextAvailableTime()

  await runQuery(
    supabase
      .from(TABLES.services)
      .insert({
        salon_id: salonId,
        name: 'Corte exemplo',
        price: 50,
        duration: '30 min',
        professional: 'Profissional Inicial',
        category: 'Exemplo'
      })
  )

  await runQuery(
    supabase
      .from(TABLES.clients)
      .insert({ salon_id: salonId, name: 'Cliente Exemplo', phone: '', active: true })
  )

  await runQuery(
    supabase
      .from(TABLES.appointments)
      .insert({
        salon_id: salonId,
        client: 'Cliente Exemplo',
        service: 'Corte exemplo',
        professional: 'Profissional Inicial',
        date: today,
        time,
        horario: time,
        value: 50,
        valor: 50,
        duration: 30,
        duracao: 30,
        status: 'Confirmado'
      })
  )

  await runQuery(
    supabase
      .from(TABLES.employees)
      .insert({
        salon_id: salonId,
        name: 'Profissional Inicial',
        phone: '',
        role: 'profissional',
        employee_type: 'professional',
        active: true,
        work_status: 'Ativo',
        work_start: '09:00',
        work_end: '18:00',
        break_start: '',
        break_end: '',
        default_duration: 30,
        schedule_interval: 30,
        commission: 40,
        service_commissions: [],
        services: ['Corte exemplo']
      })
  )

  return { created: true }
}

export async function seedInitialSalonData(salonId) {
  requireSalonId(salonId)

  const [existingServices, existingEmployees, existingClients] = await Promise.all([
    fetchServices(salonId),
    fetchEmployees(salonId),
    fetchClients(salonId)
  ])

  if ((existingServices?.length ?? 0) > 0 || (existingEmployees?.length ?? 0) > 0) {
    return { created: false }
  }

  await Promise.all([
    runQuery(
      supabase
        .from(TABLES.services)
        .insert([
          { salon_id: salonId, name: 'Corte feminino', price: 90, duration: '50 min', professional: 'Profissional Exemplo', category: 'Cabelo' },
          { salon_id: salonId, name: 'Escova modelada', price: 75, duration: '45 min', professional: 'Profissional Exemplo', category: 'Cabelo' },
          { salon_id: salonId, name: 'Manicure gel', price: 70, duration: '60 min', professional: 'Profissional Exemplo', category: 'Unhas' }
        ])
    ),
    runQuery(
      supabase
        .from(TABLES.employees)
        .insert([
          {
            salon_id: salonId,
            name: 'Caixa/Recepção',
            phone: '',
            role: 'caixa',
            employee_type: 'cashier',
            active: true,
            work_status: 'Ativo',
            commission: 0,
            service_commissions: [],
            services: []
          },
          {
            salon_id: salonId,
            name: 'Profissional Exemplo',
            phone: '',
            role: 'profissional',
            employee_type: 'professional',
            active: true,
            work_status: 'Ativo',
            work_start: '09:00',
            work_end: '18:00',
            break_start: '',
            break_end: '',
            default_duration: 60,
            schedule_interval: 60,
            commission: 30,
            service_commissions: [],
            services: ['Corte feminino', 'Escova modelada', 'Manicure gel']
          }
        ])
    ),
    (existingClients?.length ?? 0) === 0
      ? runQuery(
        supabase
          .from(TABLES.clients)
          .insert({ salon_id: salonId, name: 'Cliente Exemplo', phone: '', active: true })
      )
      : Promise.resolve(null)
  ])

  return { created: true }
}

export async function fetchServices(salonId) {
  return runQuery(bySalon(TABLES.services, salonId).order('name', { ascending: true }))
}

export async function createService(salonId, payload) {
  return runQuery(supabase.from(TABLES.services).insert(withSalon(payload, salonId)).select('*').single())
}

export async function updateService(salonId, id, payload) {
  return runQuery(supabase.from(TABLES.services).update(toSnakePayload(payload)).eq('id', id).eq('salon_id', salonId).select('*').single())
}

export async function deleteService(salonId, id) {
  return runQuery(supabase.from(TABLES.services).delete().eq('id', id).eq('salon_id', salonId))
}

export async function fetchAppointments(salonId) {
  return runQuery(bySalon(TABLES.appointments, salonId).order('date', { ascending: true }).order('time', { ascending: true }))
}

export async function createAppointment(salonId, payload) {
  return runQuery(supabase.from(TABLES.appointments).insert(withSalon(payload, salonId)).select('*').single())
}

export async function updateAppointment(salonId, id, payload) {
  return runQuery(supabase.from(TABLES.appointments).update(toSnakePayload(payload)).eq('id', id).eq('salon_id', salonId).select('*').single())
}

export async function deleteAppointment(salonId, id) {
  return runQuery(supabase.from(TABLES.appointments).delete().eq('id', id).eq('salon_id', salonId))
}

export async function fetchCashMovements(salonId) {
  return runQuery(bySalon(TABLES.cashMovements, salonId).order('date', { ascending: false }))
}

export async function fetchAdvances(salonId) {
  return runQuery(bySalon(TABLES.advances, salonId).order('date', { ascending: false }))
}

export async function fetchStockItems(salonId) {
  return runQuery(bySalon(TABLES.stockItems, salonId).order('name', { ascending: true }))
}
