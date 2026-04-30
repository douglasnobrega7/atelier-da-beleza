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
export const missingSalonIdMessage = 'salon_id ausente'

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
    const error = new Error(missingSalonIdMessage)
    error.notConfigured = true
    throw error
  }
}

async function runQuery(query) {
  const { data, error } = await query
  if (error) {
    console.error('Erro Supabase:', error)
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

function parseDurationMinutes(duration, fallback = 60) {
  if (typeof duration === 'number') return duration
  const text = String(duration ?? '').trim()
  if (!text) return fallback
  const hoursMatch = text.match(/(\d+)\s*h/i)
  const minutesMatch = text.match(/(\d+)\s*min/i)
  const plainNumber = text.match(/^\d+$/)
  const hours = hoursMatch ? Number(hoursMatch[1]) * 60 : 0
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 0
  return hours + minutes || (plainNumber ? Number(text) : fallback)
}

function pickDefined(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function hasField(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload, key)
}

function clientPayload(payload = {}, salonId, includeSalon = false) {
  return pickDefined({
    ...(includeSalon ? { salon_id: salonId } : {}),
    name: includeSalon || hasField(payload, 'name') ? payload.name : undefined,
    phone: includeSalon || hasField(payload, 'phone') ? payload.phone : undefined,
    email: includeSalon || hasField(payload, 'email') ? payload.email ?? '' : undefined,
    notes: includeSalon || hasField(payload, 'notes') ? payload.notes ?? '' : undefined
  })
}

function employeePayload(payload = {}, salonId, includeSalon = false) {
  const employeeType = payload.employeeType ?? payload.role ?? 'professional'
  return pickDefined({
    ...(includeSalon ? { salon_id: salonId } : {}),
    name: includeSalon || hasField(payload, 'name') ? payload.name : undefined,
    phone: includeSalon || hasField(payload, 'phone') ? payload.phone : undefined,
    role: includeSalon || hasField(payload, 'employeeType') ? employeeType : undefined,
    status: includeSalon || hasField(payload, 'status') || hasField(payload, 'workStatus') || hasField(payload, 'active')
      ? payload.status ?? payload.workStatus ?? (payload.active === false ? 'Inativo' : 'Ativo')
      : undefined,
    commission_percent: includeSalon || hasField(payload, 'commissionPercent') || hasField(payload, 'commission')
      ? Number(payload.commissionPercent ?? payload.commission ?? 0)
      : undefined,
    position: includeSalon || hasField(payload, 'position') || hasField(payload, 'role') ? payload.position ?? payload.role ?? '' : undefined,
    services: includeSalon || hasField(payload, 'services') ? payload.services ?? [] : undefined,
    login_email: includeSalon || hasField(payload, 'loginEmail') || hasField(payload, 'accessEmail') || hasField(payload, 'login_email') ? payload.loginEmail ?? payload.accessEmail ?? payload.login_email ?? '' : undefined,
    login_status: hasField(payload, 'loginStatus') || hasField(payload, 'login_status') ? payload.loginStatus ?? payload.login_status : undefined
  })
}

function servicePayload(payload = {}, salonId, includeSalon = false) {
  const duration = payload.duration ?? ''
  return pickDefined({
    ...(includeSalon ? { salon_id: salonId } : {}),
    name: includeSalon || hasField(payload, 'name') ? payload.name : undefined,
    category: includeSalon || hasField(payload, 'category') ? payload.category ?? '' : undefined,
    price: includeSalon || hasField(payload, 'price') ? Number(payload.price ?? 0) : undefined,
    duration_minutes: includeSalon || hasField(payload, 'durationMinutes') || hasField(payload, 'duration_minutes') || hasField(payload, 'duration')
      ? Number(payload.durationMinutes ?? payload.duration_minutes ?? parseDurationMinutes(duration))
      : undefined,
    duration: includeSalon || hasField(payload, 'duration') ? duration : undefined,
    commission_percent: includeSalon || hasField(payload, 'commissionPercent') || hasField(payload, 'commission_percent') || hasField(payload, 'commission')
      ? Number(payload.commissionPercent ?? payload.commission_percent ?? payload.commission ?? 0)
      : undefined,
    responsible: includeSalon || hasField(payload, 'responsible') || hasField(payload, 'professional') ? payload.responsible ?? payload.professional ?? '' : undefined
  })
}

function appointmentPayload(payload = {}, salonId, includeSalon = false) {
  return pickDefined({
    ...(includeSalon ? { salon_id: salonId } : {}),
    client_name: includeSalon || hasField(payload, 'clientName') || hasField(payload, 'client') ? payload.clientName ?? payload.client ?? '' : undefined,
    service_name: includeSalon || hasField(payload, 'serviceName') || hasField(payload, 'service') ? payload.serviceName ?? payload.service ?? '' : undefined,
    appointment_date: includeSalon || hasField(payload, 'appointmentDate') || hasField(payload, 'date') ? payload.appointmentDate ?? payload.date : undefined,
    appointment_time: includeSalon || hasField(payload, 'appointmentTime') || hasField(payload, 'time') || hasField(payload, 'horario') ? payload.appointmentTime ?? payload.time ?? payload.horario : undefined,
    status: includeSalon || hasField(payload, 'status') ? payload.status ?? 'Aguardando' : undefined,
    price: includeSalon || hasField(payload, 'price') || hasField(payload, 'value') || hasField(payload, 'valor') ? Number(payload.price ?? payload.value ?? payload.valor ?? 0) : undefined
  })
}

function cashMovementPayload(payload = {}, salonId, includeSalon = false) {
  const type = String(payload.type ?? payload.tipo ?? 'entrada').toLowerCase()
  const value = Number(payload.value ?? payload.valor ?? payload.serviceValue ?? payload.service_value ?? 0)
  return pickDefined({
    ...(includeSalon ? { salon_id: salonId } : {}),
    type,
    description: includeSalon || hasField(payload, 'description') || hasField(payload, 'descricao') ? payload.description ?? payload.descricao ?? '' : undefined,
    category: includeSalon || hasField(payload, 'category') || hasField(payload, 'categoria') ? payload.category ?? payload.categoria ?? '' : undefined,
    method: includeSalon || hasField(payload, 'method') || hasField(payload, 'forma_pagamento') || hasField(payload, 'paymentMethod') ? payload.method ?? payload.forma_pagamento ?? payload.paymentMethod ?? '' : undefined,
    value: includeSalon || hasField(payload, 'value') || hasField(payload, 'valor') || hasField(payload, 'serviceValue') || hasField(payload, 'service_value') ? value : undefined,
    date: includeSalon || hasField(payload, 'date') || hasField(payload, 'data') ? payload.date ?? payload.data : undefined,
    service_value: includeSalon || hasField(payload, 'serviceValue') || hasField(payload, 'service_value') ? Number(payload.serviceValue ?? payload.service_value ?? value) : undefined,
    commission_percent: includeSalon || hasField(payload, 'commissionPercent') || hasField(payload, 'commission_percent') ? Number(payload.commissionPercent ?? payload.commission_percent ?? 0) : undefined,
    commission_value: includeSalon || hasField(payload, 'commissionValue') || hasField(payload, 'commission_value') ? Number(payload.commissionValue ?? payload.commission_value ?? 0) : undefined,
    salon_value: includeSalon || hasField(payload, 'salonValue') || hasField(payload, 'salon_value') ? Number(payload.salonValue ?? payload.salon_value ?? 0) : undefined,
    employee_id: includeSalon || hasField(payload, 'employeeId') || hasField(payload, 'employee_id') ? payload.employeeId ?? payload.employee_id ?? null : undefined,
    service_id: includeSalon || hasField(payload, 'serviceId') || hasField(payload, 'service_id') ? payload.serviceId ?? payload.service_id ?? null : undefined,
    appointment_id: includeSalon || hasField(payload, 'appointmentId') || hasField(payload, 'appointment_id') ? payload.appointmentId ?? payload.appointment_id ?? null : undefined,
    referencia_id: includeSalon || hasField(payload, 'referenciaId') || hasField(payload, 'referencia_id') ? payload.referenciaId ?? payload.referencia_id ?? null : undefined,
    referencia_tipo: includeSalon || hasField(payload, 'referenciaTipo') || hasField(payload, 'referencia_tipo') ? payload.referenciaTipo ?? payload.referencia_tipo ?? '' : undefined
  })
}

function salonPayload(payload = {}) {
  return pickDefined({
    name: hasField(payload, 'name') || hasField(payload, 'salonName') ? payload.name ?? payload.salonName : undefined,
    whatsapp: hasField(payload, 'whatsapp') || hasField(payload, 'receptionWhatsapp') ? payload.whatsapp ?? payload.receptionWhatsapp ?? '' : undefined,
    working_days: hasField(payload, 'workingDays') || hasField(payload, 'working_days') ? payload.workingDays ?? payload.working_days ?? [] : undefined,
    opening_hours: hasField(payload, 'openingHours') || hasField(payload, 'opening_hours') ? payload.openingHours ?? payload.opening_hours ?? {} : undefined
  })
}

async function insertRow(table, salonId, payload, mapPayload) {
  requireSalonId(salonId)
  const data = await runQuery(
    supabase
      .from(table)
      .insert(mapPayload(payload, salonId, true))
      .select('*')
      .single()
  )
  return { ...payload, ...data }
}

async function updateRow(table, salonId, id, payload, mapPayload) {
  requireSalonId(salonId)
  const data = await runQuery(
    supabase
      .from(table)
      .update(mapPayload(payload, salonId, false))
      .eq('id', id)
      .eq('salon_id', salonId)
      .select('*')
      .single()
  )
  return { ...payload, ...data }
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

  const updatedProfile = await runQuery(
    supabase
      .from(TABLES.users)
      .update({ salon_id: salon.id })
      .eq('id', profile?.id ?? authUser.id)
      .select('*')
      .single()
  )

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

export async function updateSalon(salonId, payload) {
  requireSalonId(salonId)
  const data = await runQuery(
    supabase
      .from(TABLES.salons)
      .update(salonPayload(payload))
      .eq('id', salonId)
      .select('*')
      .single()
  )
  return { ...payload, ...data }
}

export async function fetchClients(salonId) {
  return runQuery(bySalon(TABLES.clients, salonId).order('name', { ascending: true }))
}

export async function createClient(salonId, payload) {
  return insertRow(TABLES.clients, salonId, payload, clientPayload)
}

export async function updateClient(salonId, id, payload) {
  return updateRow(TABLES.clients, salonId, id, payload, clientPayload)
}

export async function deleteClient(salonId, id) {
  return runQuery(supabase.from(TABLES.clients).delete().eq('id', id).eq('salon_id', salonId))
}

export async function fetchEmployees(salonId) {
  try {
    const data = await runQuery(bySalon(TABLES.employees, salonId).order('name', { ascending: true }))
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.error('Erro Supabase:', error)
    if (isMissingTableError(error?.original ?? error)) throw error
    return []
  }
}

export async function createEmployee(salonId, payload) {
  return insertRow(TABLES.employees, salonId, payload, employeePayload)
}

export async function updateEmployee(salonId, id, payload) {
  return updateRow(TABLES.employees, salonId, id, payload, employeePayload)
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
      .insert(servicePayload({
        name: 'Corte exemplo',
        price: 50,
        duration: '30 min',
        commissionPercent: 40,
        responsible: '',
        category: 'Cabeleireiro/Cabeleireira, Barbeiro/Barbeira'
      }, salonId, true))
  )

  await runQuery(
    supabase
      .from(TABLES.clients)
      .insert(clientPayload({ name: 'Cliente Exemplo', phone: '' }, salonId, true))
  )

  await runQuery(
    supabase
      .from(TABLES.appointments)
      .insert(appointmentPayload({
        client: 'Cliente Exemplo',
        service: 'Corte exemplo',
        date: today,
        time,
        price: 50,
        status: 'Confirmado'
      }, salonId, true))
  )

  await runQuery(
    supabase
      .from(TABLES.employees)
      .insert(employeePayload({
        name: 'Profissional Inicial',
        phone: '',
        role: 'professional',
        position: 'profissional',
        status: 'Ativo',
        commission: 40,
        services: ['Corte exemplo']
      }, salonId, true))
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
          servicePayload({ name: 'Corte feminino', price: 90, duration: '50 min', commissionPercent: 40, responsible: '', category: 'Cabeleireiro/Cabeleireira, Barbeiro/Barbeira' }, salonId, true),
          servicePayload({ name: 'Escova modelada', price: 75, duration: '45 min', commissionPercent: 40, responsible: '', category: 'Cabeleireiro/Cabeleireira' }, salonId, true),
          servicePayload({ name: 'Manicure gel', price: 70, duration: '60 min', commissionPercent: 40, responsible: '', category: 'Manicure e Pedicure' }, salonId, true)
        ])
    ),
    runQuery(
      supabase
        .from(TABLES.employees)
        .insert([
          employeePayload({
            name: 'Caixa/Recepção',
            phone: '',
            role: 'cashier',
            position: 'caixa',
            status: 'Ativo',
            commission: 0,
            services: []
          }, salonId, true),
          employeePayload({
            name: 'Profissional Exemplo',
            phone: '',
            role: 'professional',
            position: 'profissional',
            status: 'Ativo',
            commission: 30,
            services: ['Corte feminino', 'Escova modelada', 'Manicure gel']
          }, salonId, true)
        ])
    ),
    (existingClients?.length ?? 0) === 0
      ? runQuery(
        supabase
          .from(TABLES.clients)
          .insert(clientPayload({ name: 'Cliente Exemplo', phone: '' }, salonId, true))
      )
      : Promise.resolve(null)
  ])

  return { created: true }
}

export async function fetchServices(salonId) {
  requireSalonId(salonId)
  return runQuery(
    supabase
      .from('services')
      .select('*')
      .eq('salon_id', salonId)
      .order('name', { ascending: true })
  )
}

export async function createService(salonId, payload) {
  requireSalonId(salonId)
  const data = await runQuery(
    supabase
      .from('services')
      .insert(servicePayload(payload, salonId, true))
      .select('*')
      .single()
  )
  return { ...payload, ...data }
}

export async function updateService(salonId, id, payload) {
  return updateRow(TABLES.services, salonId, id, payload, servicePayload)
}

export async function deleteService(salonId, id) {
  return runQuery(supabase.from(TABLES.services).delete().eq('id', id).eq('salon_id', salonId))
}

export async function fetchAppointments(salonId) {
  return runQuery(bySalon(TABLES.appointments, salonId).order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true }))
}

export async function createAppointment(salonId, payload) {
  return insertRow(TABLES.appointments, salonId, payload, appointmentPayload)
}

export async function updateAppointment(salonId, id, payload) {
  return updateRow(TABLES.appointments, salonId, id, payload, appointmentPayload)
}

export async function deleteAppointment(salonId, id) {
  return runQuery(supabase.from(TABLES.appointments).delete().eq('id', id).eq('salon_id', salonId))
}

export async function fetchCashMovements(salonId) {
  return runQuery(bySalon(TABLES.cashMovements, salonId).order('date', { ascending: false }))
}

export async function fetchCashMovementByAppointment(salonId, appointmentId) {
  requireSalonId(salonId)
  if (!appointmentId) return null
  return runQuery(
    supabase
      .from(TABLES.cashMovements)
      .select('*')
      .eq('salon_id', salonId)
      .eq('appointment_id', appointmentId)
      .maybeSingle()
  )
}

export async function createCashMovement(salonId, payload) {
  return insertRow(TABLES.cashMovements, salonId, payload, cashMovementPayload)
}

export async function fetchAdvances(salonId) {
  return runQuery(bySalon(TABLES.advances, salonId).order('date', { ascending: false }))
}

export async function fetchStockItems(salonId) {
  return runQuery(bySalon(TABLES.stockItems, salonId).order('name', { ascending: true }))
}
