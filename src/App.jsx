import { Component, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  createAppointment as createAppointmentRecord,
  createCashMovement as createCashMovementRecord,
  createClient as createClientRecord,
  createEmployee as createEmployeeRecord,
  createService as createServiceRecord,
  databaseNotConfiguredMessage,
  deleteAppointment as deleteAppointmentRecord,
  deleteEmployee as deleteEmployeeRecord,
  deleteService as deleteServiceRecord,
  ensureAdminSalon,
  fetchAdvances as fetchAdvancesFromSupabase,
  fetchAppointments as fetchAppointmentsFromSupabase,
  fetchCashMovements as fetchCashMovementsFromSupabase,
  fetchCashMovementByAppointment as fetchCashMovementByAppointmentFromSupabase,
  fetchClients as fetchClientsFromSupabase,
  fetchEmployees as fetchEmployeesFromSupabase,
  fetchSalon,
  fetchServices as fetchServicesFromSupabase,
  fetchStockItems as fetchStockItemsFromSupabase,
  isMissingTableError,
  seedSalonData,
  updateAppointment as updateAppointmentRecord,
  updateClient as updateClientRecord,
  updateEmployee as updateEmployeeRecord,
  updateSalon as updateSalonRecord,
  updateService as updateServiceRecord
} from './lib/supabaseData'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
let services = []

const cardBase = 'min-w-0 overflow-hidden rounded-2xl border border-blush/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]'
const panelBase = 'min-w-0 overflow-hidden rounded-2xl border border-blush/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]'
const inputBase = 'focus-ring w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-500 dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100 dark:placeholder:text-white/40 dark:disabled:bg-white/5 dark:disabled:text-white/40'
const buttonPrimary = 'focus-ring inline-flex min-h-10 max-w-full items-center justify-center rounded-xl bg-graphite px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#343039] disabled:cursor-not-allowed disabled:opacity-70 dark:bg-lilacSoft dark:text-graphite dark:hover:bg-[#cfc1ef]'
const buttonSecondary = 'focus-ring inline-flex min-h-10 max-w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-graphite transition hover:bg-pearl dark:border-white/10 dark:bg-[#24202c] dark:text-gray-100 dark:hover:bg-white/10'
const buttonDanger = 'focus-ring inline-flex min-h-10 max-w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25'
const badgeBase = 'inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold'
const employeeFunctionOptions = [
  'Cabeleireiro/Cabeleireira',
  'Colorista',
  'Manicure e Pedicure',
  'Esteticista',
  'Maquiador/Maquiadora',
  'Designer de Sobrancelhas / Micropigmentador',
  'Depilador/Depiladora',
  'Barbeiro/Barbeira',
  'Técnico de Alongamento de Cílios'
]
function getTodayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - (offset * 60 * 1000)).toISOString().slice(0, 10)
}

const todayIso = getTodayIso()
const weekDayOptions = [
  { id: 'monday', label: 'Segunda' },
  { id: 'tuesday', label: 'Terça' },
  { id: 'wednesday', label: 'Quarta' },
  { id: 'thursday', label: 'Quinta' },
  { id: 'friday', label: 'Sexta' },
  { id: 'saturday', label: 'Sábado' },
  { id: 'sunday', label: 'Domingo' }
]
const defaultWorkingDays = weekDayOptions.map((day) => day.id)
const defaultOpeningHours = Object.fromEntries(weekDayOptions.map((day) => [day.id, { open: '09:00', close: '18:00' }]))
const appointmentSlotInterval = 15
const appointmentPaymentOptions = ['Sem pagamento', 'Dinheiro', 'Pix', 'Cartao']
const appointmentPaymentValues = ['', 'dinheiro', 'pix', 'cartao']

function normalizeAppointmentPaymentMethod(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized === 'dinheiro' || normalized === 'pix' || normalized === 'cartao') return normalized
  return null
}

function cashPaymentMethodLabel(value) {
  const labels = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão' }
  return labels[normalizeAppointmentPaymentMethod(value)] ?? 'Pendente'
}

function timeToMinutes(time) {
  const [hoursValue, minutesValue] = String(time ?? '').split(':').map(Number)
  if (!Number.isFinite(hoursValue) || !Number.isFinite(minutesValue)) return Number.NaN
  return (hoursValue * 60) + minutesValue
}

function minutesToTime(totalMinutes) {
  const hoursValue = Math.floor(totalMinutes / 60)
  const minutesValue = totalMinutes % 60
  return `${String(hoursValue).padStart(2, '0')}:${String(minutesValue).padStart(2, '0')}`
}

function parseDurationToMinutes(duration, fallback = 60) {
  if (typeof duration === 'number' && Number.isFinite(duration)) return duration
  const text = String(duration ?? '').trim().toLowerCase()
  if (!text) return fallback
  const plainNumber = text.match(/^\d+$/)
  if (plainNumber) return Number(text)
  const hoursMatch = text.match(/(\d+)\s*h/)
  const minutesMatch = text.match(/(\d+)\s*min/)
  const hoursValue = hoursMatch ? Number(hoursMatch[1]) * 60 : 0
  const minutesValue = minutesMatch ? Number(minutesMatch[1]) : 0
  return hoursValue + minutesValue || fallback
}

function serviceDurationToMinutes(serviceOrDuration, fallback = 60) {
  if (serviceOrDuration && typeof serviceOrDuration === 'object') {
    return parseDurationToMinutes(
      serviceOrDuration.duration_minutes ??
      serviceOrDuration.durationMinutes ??
      serviceOrDuration.duration ??
      serviceOrDuration.durationText,
      fallback
    )
  }
  return parseDurationToMinutes(serviceOrDuration, fallback)
}

function getAppointmentDuration(appointment, employee) {
  const service = services.find((item) => item.name === appointment.service)
  return Number(appointment.duracao) || Number(appointment.duration) || serviceDurationToMinutes(service, Number(employee?.defaultDuration) || 60)
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

function normalizeWorkingDays(value) {
  const parsed = parseJsonValue(value, defaultWorkingDays)
  if (!Array.isArray(parsed)) return defaultWorkingDays
  return parsed.filter((day) => weekDayOptions.some((option) => option.id === day))
}

function normalizeOpeningHours(value) {
  const parsed = parseJsonValue(value, defaultOpeningHours)
  return weekDayOptions.reduce((acc, day) => {
    const hours = parsed?.[day.id] ?? {}
    acc[day.id] = {
      open: hours.open || defaultOpeningHours[day.id].open,
      close: hours.close || defaultOpeningHours[day.id].close
    }
    return acc
  }, {})
}

function getWeekDayId(date) {
  const [year, month, day] = String(date ?? '').split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return null
  return weekDayOptions[(parsed.getDay() + 6) % 7]?.id ?? null
}

function getSalonHoursForDate(salonSettings, date) {
  const weekday = getWeekDayId(date)
  const workingDays = normalizeWorkingDays(salonSettings?.workingDays)
  const openingHours = normalizeOpeningHours(salonSettings?.openingHours)
  if (!weekday || !workingDays.includes(weekday)) return null
  const hours = openingHours[weekday]
  const open = timeToMinutes(hours?.open)
  const close = timeToMinutes(hours?.close)
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) return null
  return { ...hours, openMinutes: open, closeMinutes: close }
}

function formatSalonHoursForDate(salonSettings, date) {
  const hours = getSalonHoursForDate(salonSettings, date)
  return hours ? `${hours.open} às ${hours.close}` : 'Fechado'
}

function getAppointmentSortKey(appointment) {
  return `${appointment?.date ?? ''} ${appointment?.time ?? appointment?.horario ?? ''}`
}

function getAppointmentEmployeeId(appointment) {
  return field(appointment, 'employeeId', 'employee_id')
}

function getAppointmentEmployeeName(appointment, employees = []) {
  const employeeId = getAppointmentEmployeeId(appointment)
  const employee = employees.find((item) => String(item.id) === String(employeeId))
  return employee?.name ?? field(appointment, 'employeeName', 'employee_name') ?? ''
}

function isAppointmentForEmployee(appointment, employee) {
  if (!employee) return false
  const employeeId = getAppointmentEmployeeId(appointment)
  if (employeeId !== undefined && employeeId !== null && employeeId !== '') {
    return String(employeeId) === String(employee.id)
  }
  return getAppointmentEmployeeName(appointment) === employee.name
}

function getBlockEmployeeName(block) {
  return field(block, 'employeeName', 'employee_name') ?? ''
}

function intervalsOverlap(startA, endA, startB, endB) {
  if (![startA, endA, startB, endB].every(Number.isFinite)) return false
  return startA < endB && startB < endA
}

function getAvailableSlots({ employee, date, service, appointments, blockedSlots = [], salonSettings }) {
  if (!employee || !date || employee.workStatus === 'De folga') return []

  const salonHours = getSalonHoursForDate(salonSettings, date)
  if (!salonHours) return []

  const start = salonHours.openMinutes
  const end = salonHours.closeMinutes
  const duration = serviceDurationToMinutes(service, Number(employee.defaultDuration) || 60)
  const breakStart = employee.breakStart ? timeToMinutes(employee.breakStart) : null
  const breakEnd = employee.breakEnd ? timeToMinutes(employee.breakEnd) : null
  const booked = appointments.filter((appointment) => (
    isAppointmentForEmployee(appointment, employee) &&
    appointment.date === date &&
    !isCancelledStatus(appointment.status)
  ))
  const blocked = blockedSlots.filter((block) => getBlockEmployeeName(block) === employee.name && block.date === date)

  const slots = []
  for (let current = start; current + duration <= end; current += appointmentSlotInterval) {
    const candidateEnd = current + duration
    const isBreak = breakStart !== null && breakEnd !== null && intervalsOverlap(current, candidateEnd, breakStart, breakEnd)
    const isBooked = booked.some((appointment) => {
      const bookedStart = timeToMinutes(appointment.time ?? appointment.horario)
      const bookedEnd = bookedStart + getAppointmentDuration(appointment, employee)
      return intervalsOverlap(current, candidateEnd, bookedStart, bookedEnd)
    })
    const isBlocked = blocked.some((block) => intervalsOverlap(current, candidateEnd, timeToMinutes(block.start), timeToMinutes(block.end)))

    if (!isBreak && !isBooked && !isBlocked) slots.push(minutesToTime(current))
  }
  return slots
}

function getOccupiedSlots({ employee, date, appointments }) {
  if (!employee || !date) return []

  return appointments
    .filter((appointment) => (
      isAppointmentForEmployee(appointment, employee) &&
      appointment.date === date &&
      !isCancelledStatus(appointment.status)
    ))
    .sort((a, b) => getAppointmentSortKey(a).localeCompare(getAppointmentSortKey(b)))
}

function formatDate(date) {
  if (!date) return ''
  let parsedDate
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number)
    parsedDate = new Date(year, month - 1, day)
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [day, month, year] = date.split('/').map(Number)
    parsedDate = new Date(year, month - 1, day)
  } else {
    return date
  }

  if (Number.isNaN(parsedDate.getTime())) return date

  const weekday = parsedDate.toLocaleDateString('pt-BR', { weekday: 'long' })
  const formattedDate = parsedDate.toLocaleDateString('pt-BR')
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formattedDate}`
}

function shiftDate(date, days) {
  if (!date) return getTodayIso()
  const [year, month, day] = date.split('-').map(Number)
  const nextDate = new Date(year, month - 1, day)
  nextDate.setDate(nextDate.getDate() + days)
  const nextYear = nextDate.getFullYear()
  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0')
  const nextDay = String(nextDate.getDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

function getWeekDates(date) {
  const [year, month, day] = date.split('-').map(Number)
  const base = new Date(year, month - 1, day)
  const start = new Date(base)
  start.setDate(base.getDate() - base.getDay())
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start)
    current.setDate(start.getDate() + index)
    return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
  })
}

function getWeekdayLabel(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(year, month - 1, day))
}

function normalizePhone(phone = '') {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function calculateCommission(appointment, employees) {
  const employee = employees.find((item) => isAppointmentForEmployee(appointment, item))
  return calculateCommissionDetails(appointment, employee).comissaoCalculada
}

function getCommissionRule(appointment, employee) {
  const service = services.find((item) => item.name === appointment.service)
  if (service) return { type: 'percentage', value: Number(service.commission_percent ?? service.commissionPercent ?? 0) || 0, source: 'service' }
  return { type: 'percentage', value: Number(employee?.commission) || 0, source: 'default' }
}

function calculateCommissionDetails(appointment, employee) {
  const rule = getCommissionRule(appointment, employee)
  const serviceValue = Number(appointment.value ?? appointment.valor ?? 0)
  const calculated = rule.type === 'fixed' ? rule.value : serviceValue * (rule.value / 100)
  return {
    tipoComissao: rule.type,
    valorComissaoConfigurado: rule.value,
    comissaoCalculada: calculated,
    commission: calculated,
    commissionSource: rule.source
  }
}

function getAppointmentCommission(appointment, employees) {
  if (!isCompletedStatus(appointment.status)) return 0
  return Number(appointment.comissaoCalculada ?? appointment.commission ?? calculateCommission(appointment, employees) ?? 0)
}

function formatCommissionRule(rule) {
  if (!rule) return 'Sem Comissão'
  const type = rule.type ?? rule.tipoComissao
  const value = Number(rule.value ?? rule.valorComissaoConfigurado ?? 0)
  return type === 'fixed' ? money.format(value) : `${value}%`
}

function isProfessional(employee) {
  return (employee?.employeeType ?? 'professional') === 'professional'
}

function normalizeLoginPart(value, fallback) {
  const normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return normalized || fallback
}

function getSalonDomain(settings) {
  return `${normalizeLoginPart(settings?.salonName ?? '', 'salao')}.com`
}

function getSidebarSalonName(salonName) {
  const name = salonName?.trim()
  if (!name) return ''
  return name.replace(/^salão\s+/i, '').trim()
}

function getSuggestedAccessEmail({ name, employeeType = 'professional', salonSettings }) {
  const domain = getSalonDomain(salonSettings)
  if (employeeType === 'admin') return `admin@${domain}`
  return `${normalizeLoginPart(name, employeeType === 'cashier' ? 'caixa' : 'profissional')}@${domain}`
}

function getProfessionals(employees) {
  return (employees || []).filter(isProfessional)
}

function withCommission(appointment, employees) {
  if (!isCompletedStatus(appointment.status)) return { ...appointment, commission: 0, comissaoCalculada: 0 }
  const employee = employees.find((item) => isAppointmentForEmployee(appointment, item))
  return { ...appointment, ...calculateCommissionDetails(appointment, employee) }
}

function getClientInsights(clientName, appointments) {
  const visits = appointments.filter((item) => item.client === clientName && isCompletedStatus(item.status))
  const serviceCounts = visits.reduce((acc, item) => ({ ...acc, [item.service]: (acc[item.service] || 0) + 1 }), {})
  const favoriteService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sem histórico'
  const total = visits.reduce((sum, item) => sum + Number(item.value ?? item.valor ?? 0), 0)
  const lastVisit = visits.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0]?.date
  return {
    favoriteService,
    lastVisit: lastVisit ? formatDate(lastVisit) : 'Sem visita concluída',
    visitCount: visits.length,
    averageTicket: visits.length ? total / visits.length : 0
  }
}

function countBy(items, keyGetter) {
  return items.reduce((acc, item) => {
    const key = keyGetter(item)
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function topEntries(counts, limit = 4) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function cashType(entry) {
  return (entry.tipo ?? entry.type ?? '').toLowerCase()
}

function cashValue(entry) {
  return Number(entry.valor ?? entry.value ?? 0)
}

function cashMethod(entry) {
  return entry.forma_pagamento ?? entry.method ?? ''
}

function cashDescription(entry) {
  return entry.descricao ?? entry.description ?? ''
}

function cashCategory(entry) {
  return entry.categoria ?? entry.category ?? ''
}

function isCompletedStatus(status) {
  return normalizeAppointmentStatus(status) === 'concluido'
}

function isCancelledStatus(status) {
  return normalizeAppointmentStatus(status) === 'cancelado'
}

function normalizeAppointmentStatus(status) {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized === 'agendado' || normalized === 'aguardando') return 'agendado'
  if (normalized === 'confirmado') return 'confirmado'
  if (normalized === 'concluido') return 'concluido'
  if (normalized === 'cancelado') return 'cancelado'
  return 'agendado'
}

const appointmentStatusOptions = ['agendado', 'confirmado', 'concluido', 'cancelado']

const appointmentStatusLabels = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado'
}

function formatAppointmentStatus(status) {
  return appointmentStatusLabels[normalizeAppointmentStatus(status)] ?? 'Agendado'
}

function cashAppointmentId(entry) {
  const appointmentId = field(entry, 'appointmentId', 'appointment_id')
  if (appointmentId) return appointmentId
  const referenceType = String(field(entry, 'referenciaTipo', 'referencia_tipo') ?? '').toLowerCase()
  return referenceType === 'appointment' ? field(entry, 'referenciaId', 'referencia_id') : null
}

function cashCommissionValue(entry) {
  return Number(field(entry, 'commissionValue', 'commission_value') ?? 0)
}

function cashSalonValue(entry) {
  return Number(field(entry, 'salonValue', 'salon_value') ?? cashValue(entry))
}

function cashClientName(entry) {
  return field(entry, 'clientName', 'client_name') ?? ''
}

function cashServiceName(entry) {
  return field(entry, 'serviceName', 'service_name') ?? ''
}

function cashEmployeeName(entry) {
  return field(entry, 'employeeName', 'employee_name') ?? ''
}

function isAppointmentCashEntry(entry) {
  return cashType(entry) === 'entrada' && Boolean(cashAppointmentId(entry))
}

function createCompletedAppointmentCashEntry(appointment, employees = [], serviceItems = services) {
  const service = serviceItems.find((item) => item.name === appointment.service)
  const employee = employees.find((item) => isAppointmentForEmployee(appointment, item))
  const serviceValue = Number(appointment.value ?? appointment.valor ?? service?.price ?? 0) || 0
  const commissionPercent = Number(service?.commission_percent ?? service?.commissionPercent ?? 0) || 0
  const commissionValue = (serviceValue * commissionPercent) / 100
  const salonValue = serviceValue - commissionValue
  const createdAt = new Date().toISOString()
  return {
    type: 'entrada',
    tipo: 'entrada',
    category: 'Atendimento',
    categoria: 'Atendimento',
    description: `Atendimento - ${appointment.client}`,
    descricao: `Atendimento - ${appointment.client}`,
    method: cashPaymentMethodLabel(appointment.paymentMethod ?? appointment.method),
    forma_pagamento: cashPaymentMethodLabel(appointment.paymentMethod ?? appointment.method),
    value: serviceValue,
    valor: serviceValue,
    date: appointment.date ?? todayIso,
    data: appointment.date ?? todayIso,
    status: 'concluido',
    clientName: appointment.client ?? '',
    client_name: appointment.client ?? '',
    serviceName: service?.name ?? appointment.service ?? '',
    service_name: service?.name ?? appointment.service ?? '',
    employeeName: employee?.name ?? getAppointmentEmployeeName(appointment) ?? '',
    employee_name: employee?.name ?? getAppointmentEmployeeName(appointment) ?? '',
    serviceValue,
    service_value: serviceValue,
    commissionPercent,
    commission_percent: commissionPercent,
    commissionValue,
    commission_value: commissionValue,
    salonValue,
    salon_value: salonValue,
    employeeId: employee?.id ?? null,
    employee_id: employee?.id ?? null,
    serviceId: service?.id ?? null,
    service_id: service?.id ?? null,
    appointmentId: appointment.id,
    appointment_id: appointment.id,
    referenciaId: appointment.id,
    referencia_id: appointment.id,
    referenciaTipo: 'appointment',
    referencia_tipo: 'appointment',
    createdAt,
    created_at: createdAt
  }
}

function createAdvanceCashEntry(advance) {
  return {
    id: Date.now() + 1,
    tipo: 'saida',
    type: 'Saída',
    categoria: 'Vale',
    category: 'Vale',
    descricao: `Vale - ${advance.employee}`,
    description: `Vale - ${advance.employee}`,
    valor: Number(advance.value) || 0,
    value: Number(advance.value) || 0,
    data: advance.date,
    date: advance.date,
    forma_pagamento: 'Dinheiro',
    method: 'Dinheiro',
    referenciaId: advance.id,
    referenciaTipo: 'vale'
  }
}

function field(row, camelKey, snakeKey = camelKey) {
  return row?.[camelKey] ?? row?.[snakeKey]
}

function toList(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

function formatServices(services) {
  if (Array.isArray(services)) return services.join(', ')
  if (typeof services === 'string') return services
  return ''
}

function formatEmployeeFunctions(role) {
  return toList(role).join(', ')
}

function formatServiceFunctions(category) {
  return toList(category).join(', ')
}

function getCompatibleServicesForProfessional(professional, serviceItems = services) {
  if (!professional) return []

  const professionalFunctions = toList(professional.role).map((item) => item.toLowerCase())
  if (professionalFunctions.length === 0) return []

  return (serviceItems || []).filter((service) => (
    toList(service.category).some((category) => professionalFunctions.includes(category.toLowerCase()))
  ))
}

function isServiceCompatibleWithProfessional(service, professional) {
  return getCompatibleServicesForProfessional(professional).some((item) => item.name === service?.name)
}

function toObjectList(value) {
  return Array.isArray(value) ? value : []
}

function normalizeClientRecord(row) {
  return {
    ...row,
    name: field(row, 'name') ?? '',
    phone: field(row, 'phone') ?? '',
    email: field(row, 'email') ?? '',
    birthday: field(row, 'birthday') ?? '',
    notes: field(row, 'notes') ?? '',
    history: field(row, 'history') ?? [],
    lastVisit: field(row, 'lastVisit', 'last_visit') ?? 'Sem visita concluída',
    active: field(row, 'active') ?? true
  }
}

function normalizeEmployeeRecord(row) {
  const rawRole = field(row, 'role')
  const employeeType = field(row, 'employeeType', 'employee_type') ?? (['cashier', 'caixa'].includes(rawRole) ? 'cashier' : 'professional')
  const professional = employeeType === 'professional'
  const status = field(row, 'status') || 'ativo'
  const loginStatus = field(row, 'loginStatus', 'login_status') ?? ''
  const commissionPercent = Number(field(row, 'commission_percent') ?? field(row, 'commission') ?? 0)
  return {
    ...row,
    name: field(row, 'name') ?? '',
    phone: field(row, 'phone') ?? '',
    status,
    position: field(row, 'position') || '',
    role: field(row, 'position') || rawRole || '',
    active: field(row, 'active') ?? status.toLowerCase() !== 'inativo',
    commission_percent: commissionPercent,
    commission: Number(field(row, 'commission') ?? commissionPercent ?? 0),
    workStatus: field(row, 'workStatus', 'work_status') ?? status,
    employeeType,
    workStart: field(row, 'workStart', 'work_start') ?? (professional ? '09:00' : ''),
    workEnd: field(row, 'workEnd', 'work_end') ?? (professional ? '18:00' : ''),
    breakStart: field(row, 'breakStart', 'break_start') ?? '',
    breakEnd: field(row, 'breakEnd', 'break_end') ?? '',
    defaultDuration: field(row, 'defaultDuration', 'default_duration') ?? 60,
    scheduleInterval: field(row, 'scheduleInterval', 'schedule_interval') ?? field(row, 'defaultDuration', 'default_duration') ?? 60,
    serviceCommissions: professional ? toObjectList(field(row, 'serviceCommissions', 'service_commissions')) : [],
    services: professional ? toList(field(row, 'services') || '') : [],
    userId: field(row, 'userId', 'user_id') ?? '',
    accessEmail: field(row, 'accessEmail', 'access_email') ?? field(row, 'login_email') ?? '',
    temporaryPassword: field(row, 'temporaryPassword', 'temporary_password') ?? '',
    loginStatus,
    loginActive: Boolean(field(row, 'loginActive', 'login_active') ?? String(loginStatus).toLowerCase() === 'ativo')
  }
}

function normalizeServiceRecord(row) {
  const commissionPercent = Number(field(row, 'commissionPercent', 'commission_percent') ?? field(row, 'commission') ?? 0)
  return {
    ...row,
    name: field(row, 'name') ?? '',
    price: Number(field(row, 'price') ?? 0),
    duration: field(row, 'duration') ?? '1h',
    durationMinutes: field(row, 'durationMinutes', 'duration_minutes'),
    responsible: field(row, 'responsible') ?? '',
    category: field(row, 'category') ?? '',
    commission_percent: commissionPercent,
    commissionPercent
  }
}

function normalizeAppointmentRecord(row, employees = []) {
  const time = field(row, 'time') ?? field(row, 'horario') ?? field(row, 'appointmentTime', 'appointment_time') ?? ''
  const value = Number(field(row, 'value') ?? field(row, 'valor') ?? field(row, 'price') ?? 0)
  const duration = field(row, 'duration') ?? field(row, 'duracao')
  const employeeId = field(row, 'employeeId', 'employee_id')
  const employee = employees.find((item) => String(item.id) === String(employeeId))
  const employeeName = employee?.name ?? field(row, 'employeeName', 'employee_name') ?? row?.employees?.name ?? ''
  return withCommission({
    ...row,
    client: field(row, 'client') ?? field(row, 'clientName', 'client_name') ?? '',
    service: field(row, 'service') ?? field(row, 'serviceName', 'service_name') ?? '',
    serviceName: field(row, 'serviceName', 'service_name') ?? field(row, 'service') ?? '',
    service_name: field(row, 'service_name') ?? field(row, 'serviceName') ?? field(row, 'service') ?? '',
    serviceId: field(row, 'serviceId', 'service_id'),
    service_id: field(row, 'service_id') ?? field(row, 'serviceId'),
    employeeId,
    employee_id: field(row, 'employee_id') ?? field(row, 'employeeId'),
    employeeName,
    employee_name: employeeName,
    date: field(row, 'date') ?? field(row, 'appointmentDate', 'appointment_date') ?? todayIso,
    time,
    horario: time,
    value,
    valor: value,
    duration,
    duracao: duration,
    status: normalizeAppointmentStatus(field(row, 'status')),
    paymentMethod: normalizeAppointmentPaymentMethod(field(row, 'paymentMethod', 'payment_method'))
  }, employees)
}

function normalizeCashMovementRecord(row) {
  const serviceValue = Number(field(row, 'serviceValue', 'service_value') ?? field(row, 'value') ?? field(row, 'valor') ?? 0)
  const commissionValue = Number(field(row, 'commissionValue', 'commission_value') ?? 0)
  return {
    ...row,
    type: field(row, 'type') ?? field(row, 'tipo') ?? 'Entrada',
    tipo: field(row, 'tipo') ?? String(field(row, 'type') ?? 'Entrada').toLowerCase(),
    description: field(row, 'description') ?? field(row, 'descricao') ?? '',
    descricao: field(row, 'descricao') ?? field(row, 'description') ?? '',
    category: field(row, 'category') ?? field(row, 'categoria') ?? '',
    categoria: field(row, 'categoria') ?? field(row, 'category') ?? '',
    method: field(row, 'method') ?? field(row, 'forma_pagamento') ?? '',
    forma_pagamento: field(row, 'forma_pagamento') ?? field(row, 'method') ?? '',
    value: Number(field(row, 'value') ?? field(row, 'valor') ?? 0),
    valor: Number(field(row, 'valor') ?? field(row, 'value') ?? 0),
    date: field(row, 'date') ?? field(row, 'data') ?? todayIso,
    data: field(row, 'data') ?? field(row, 'date') ?? todayIso,
    status: field(row, 'status') ?? '',
    clientName: field(row, 'clientName', 'client_name') ?? '',
    client_name: field(row, 'client_name') ?? field(row, 'clientName') ?? '',
    serviceName: field(row, 'serviceName', 'service_name') ?? '',
    service_name: field(row, 'service_name') ?? field(row, 'serviceName') ?? '',
    employeeName: field(row, 'employeeName', 'employee_name') ?? '',
    employee_name: field(row, 'employee_name') ?? field(row, 'employeeName') ?? '',
    serviceValue,
    service_value: serviceValue,
    commissionPercent: Number(field(row, 'commissionPercent', 'commission_percent') ?? 0),
    commission_percent: Number(field(row, 'commission_percent') ?? field(row, 'commissionPercent') ?? 0),
    commissionValue,
    commission_value: commissionValue,
    salonValue: Number(field(row, 'salonValue', 'salon_value') ?? (serviceValue - commissionValue)),
    salon_value: Number(field(row, 'salon_value') ?? field(row, 'salonValue') ?? (serviceValue - commissionValue)),
    employeeId: field(row, 'employeeId', 'employee_id'),
    employee_id: field(row, 'employee_id') ?? field(row, 'employeeId'),
    serviceId: field(row, 'serviceId', 'service_id'),
    service_id: field(row, 'service_id') ?? field(row, 'serviceId'),
    appointmentId: field(row, 'appointmentId', 'appointment_id'),
    appointment_id: field(row, 'appointment_id') ?? field(row, 'appointmentId'),
    referenciaId: field(row, 'referenciaId', 'referencia_id'),
    referencia_id: field(row, 'referencia_id') ?? field(row, 'referenciaId'),
    referenciaTipo: field(row, 'referenciaTipo', 'referencia_tipo'),
    referencia_tipo: field(row, 'referencia_tipo') ?? field(row, 'referenciaTipo'),
    createdAt: field(row, 'createdAt', 'created_at'),
    created_at: field(row, 'created_at') ?? field(row, 'createdAt')
  }
}

function normalizeAdvanceRecord(row) {
  return {
    ...row,
    employee: field(row, 'employee') ?? '',
    value: Number(field(row, 'value') ?? 0),
    date: field(row, 'date') ?? todayIso,
    status: field(row, 'status') ?? 'Aberto',
    reason: field(row, 'reason') ?? ''
  }
}

function normalizeStockItemRecord(row) {
  return {
    ...row,
    name: field(row, 'name') ?? field(row, 'product') ?? '',
    product: field(row, 'product') ?? field(row, 'name') ?? '',
    category: field(row, 'category') ?? 'Uso geral',
    unit: field(row, 'unit') ?? 'unidade',
    notes: field(row, 'notes') ?? '',
    quantity: Number(field(row, 'quantity') ?? 0),
    cost: Number(field(row, 'cost') ?? 0),
    min: Number(field(row, 'min') ?? 0)
  }
}

function normalizeSalonSettings(row) {
  return {
    salonName: field(row, 'name') ?? field(row, 'salonName', 'salon_name') ?? '',
    receptionWhatsapp: field(row, 'whatsapp') ?? field(row, 'receptionWhatsapp', 'reception_whatsapp') ?? '',
    workingDays: normalizeWorkingDays(field(row, 'workingDays', 'working_days')),
    openingHours: normalizeOpeningHours(field(row, 'openingHours', 'opening_hours'))
  }
}

function handleDataActionError(error, notify) {
  console.error('Erro Supabase:', error)
  const message = error?.message || 'Não foi possível salvar no banco de dados.'
  if (isMissingTableError(error?.original ?? error)) {
    notify?.(error?.message || databaseNotConfiguredMessage, 'error')
    return true
  }
  notify?.(message, 'error')
  return true
}

function getDataActionErrorMessage(error) {
  return error?.original?.message || error?.message || 'Nao foi possivel salvar no banco de dados.'
}

function handleAgendaDataActionError(error, notify) {
  console.error('Erro Agenda Supabase/API:', error?.original ?? error)
  notify?.(getDataActionErrorMessage(error), 'error')
  return true
}

function ErrorCard({ message }) {
  return (
    <Panel title="Erro ao carregar esta tela">
      <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{message || 'Erro inesperado.'}</p>
    </Panel>
  )
}

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Erro ao carregar esta tela:', error)
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return <ErrorCard message={this.state.error.message} />
    }
    return this.props.children
  }
}

const adminMenu = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'funcionarios', label: 'Funcionários' },
  { id: 'caixa', label: 'Caixa' },
  { id: 'vales', label: 'Vales' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'configuracoes', label: 'Configurações' }
]

const cashierMenu = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'caixa', label: 'Caixa' }
]

const professionalMenu = [
  { id: 'minha-agenda', label: 'Minha Agenda' },
  { id: 'perfil', label: 'Perfil' }
]

const statusStyles = {
  agendado: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200',
  confirmado: 'border-violet-100 bg-lilacSoft/40 text-violet-800 dark:border-violet-300/30 dark:bg-violet-500/20 dark:text-violet-100',
  concluido: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200',
  cancelado: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200'
}

const employeeStatuses = ['Ativo', 'De folga', 'Horário de almoço']
const employeeStatusStyles = {
  Ativo: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200',
  'De folga': 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200',
  'Horário de almoço': 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200'
}

function getStoredTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem('salon-theme') === 'dark' ? 'dark' : 'light'
}

const sessionPersistenceKey = 'salon-session-persistence'
const browserSessionKey = 'salon-browser-session-active'

function normalizeRole(role) {
  const normalizedRole = String(role ?? '').trim().toLowerCase()
  if (normalizedRole === 'caixa' || normalizedRole === 'cashier') return 'cashier'
  if (normalizedRole === 'profissional' || normalizedRole === 'professional') return 'professional'
  return normalizedRole === 'admin' ? 'admin' : ''
}

function getRoleTitle(role) {
  if (role === 'admin') return 'Admin'
  if (role === 'cashier') return 'Funcionário Caixa'
  return 'Profissional'
}

function normalizeUserProfile(profile, employees = []) {
  const role = normalizeRole(profile?.role)
  if (!profile?.email || !role) return null
  const employee = employees.find((item) => (
    item.name === profile.name ||
    item.accessEmail?.toLowerCase() === profile.email.toLowerCase()
  ))
  return {
    id: profile.id,
    salonId: profile.salon_id,
    role,
    dbRole: profile.role,
    employeeId: employee?.id,
    name: profile.name,
    title: getRoleTitle(role),
    email: profile.email,
    phone: employee?.phone ?? ''
  }
}

function createAdminFallbackUser(authUser) {
  const email = authUser?.email ?? ''
  return {
    id: authUser?.id ?? 'auth-admin',
    salonId: null,
    role: 'admin',
    dbRole: 'admin',
    employeeId: undefined,
    name: email ? email.split('@')[0] : 'Admin',
    title: getRoleTitle('admin'),
    email,
    phone: ''
  }
}

function getInitialPageForRole(role) {
  if (role === 'admin') return 'dashboard'
  if (role === 'professional') return 'minha-agenda'
  return 'agenda'
}

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [activePage, setActivePage] = useState('dashboard')
  const [agendaProfessional, setAgendaProfessional] = useState('all')
  const [theme, setTheme] = useState(getStoredTheme)
  const [toast, setToast] = useState(null)
  const [currentSalonId, setCurrentSalonId] = useState(null)
  const [databaseStatus, setDatabaseStatus] = useState({ notConfigured: false, message: '' })
  const [dataLoading, setDataLoading] = useState(false)
  const [cashEntries, setCashEntries] = useState([])
  const [cashClosures, setCashClosures] = useState([])
  const [advances, setAdvances] = useState([])
  const [blockedSlots, setBlockedSlots] = useState([])
  const [salonSettings, setSalonSettings] = useState({ salonName: '', receptionWhatsapp: '', workingDays: defaultWorkingDays, openingHours: defaultOpeningHours })
  const [serviceItems, setServiceItems] = useState([])
  services = serviceItems
  const [appointments, setAppointments] = useState([])
  const [clients, setClients] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [employees, setEmployees] = useState([])

  function clearSalonData() {
    setCashEntries([])
    setCashClosures([])
    setAdvances([])
    setBlockedSlots([])
    setSalonSettings({ salonName: '', receptionWhatsapp: '', workingDays: defaultWorkingDays, openingHours: defaultOpeningHours })
    setServiceItems([])
    services = []
    setAppointments([])
    setClients([])
    setInventoryItems([])
    setEmployees([])
  }

  async function loadSalonData(salonId) {
    if (!salonId) {
      clearSalonData()
      setDatabaseStatus({ notConfigured: false, message: 'Salão ainda não vinculado.' })
      return
    }

    setDataLoading(true)
    try {
      let [
        salonRow,
        clientRows,
        employeeRows,
        serviceRows,
        appointmentRows,
        cashMovementRows,
        advanceRows,
        stockRows
      ] = await Promise.all([
        fetchSalon(salonId),
        fetchClientsFromSupabase(salonId),
        fetchEmployeesFromSupabase(salonId),
        fetchServicesFromSupabase(salonId),
        fetchAppointmentsFromSupabase(salonId),
        fetchCashMovementsFromSupabase(salonId),
        fetchAdvancesFromSupabase(salonId),
        fetchStockItemsFromSupabase(salonId)
      ])

      if ((employeeRows?.length ?? 0) === 0) {
        try {
          const seedResult = await seedSalonData(salonId)

          if (seedResult.created) {
            const [seededClientRows, seededEmployeeRows, seededServiceRows, seededAppointmentRows] = await Promise.all([
              fetchClientsFromSupabase(salonId),
              fetchEmployeesFromSupabase(salonId),
              fetchServicesFromSupabase(salonId),
              fetchAppointmentsFromSupabase(salonId)
            ])

            clientRows = seededClientRows
            employeeRows = seededEmployeeRows
            serviceRows = seededServiceRows
            appointmentRows = seededAppointmentRows
            notify('Sistema preparado para este salão')
          }
        } catch (seedError) {
          console.error('Seed inicial não criado:', seedError)
        }
      }

      const normalizedEmployees = (employeeRows ?? []).map(normalizeEmployeeRecord)
      const normalizedServices = (serviceRows ?? []).map(normalizeServiceRecord)
      services = normalizedServices
      const normalizedAppointments = (appointmentRows ?? []).map((appointment) => normalizeAppointmentRecord(appointment, normalizedEmployees))
      const normalizedAdvances = (advanceRows ?? []).map(normalizeAdvanceRecord)
      const advanceCashEntries = normalizedAdvances.map((advance) => createAdvanceCashEntry(advance))

      setSalonSettings(normalizeSalonSettings(salonRow ?? {}))
      setClients((clientRows ?? []).map(normalizeClientRecord))
      setEmployees(normalizedEmployees)
      setServiceItems(normalizedServices)
      setAppointments(normalizedAppointments)
      setCashEntries([...(cashMovementRows ?? []).map(normalizeCashMovementRecord), ...advanceCashEntries])
      setAdvances(normalizedAdvances)
      setInventoryItems((stockRows ?? []).map(normalizeStockItemRecord))
      setDatabaseStatus({ notConfigured: false, message: '' })
    } catch (error) {
      if (isMissingTableError(error?.original ?? error)) {
        setDatabaseStatus({ notConfigured: true, message: databaseNotConfiguredMessage })
        return
      }
      throw error
    } finally {
      setDataLoading(false)
    }
  }

  async function loadProfileForAuthUser(authUser, { createMissingProfile = false } = {}) {
    if (!authUser?.id) return null

    const { data: profileById, error: profileByIdError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileByIdError) {
      console.error('Erro perfil:', profileByIdError)
      throw new Error(`Erro ao buscar perfil: ${profileByIdError.message}`)
    }

    if (profileById || !createMissingProfile) return profileById

    const { data: newProfile, error: createProfileError } = await supabase
      .from('users')
      .insert({
        id: authUser.id,
        email: authUser.email,
        name: 'Admin',
        role: 'admin',
        salon_id: null
      })
      .select()
      .single()

    if (createProfileError) {
      console.error('Erro criando perfil:', createProfileError)
      throw new Error(`Erro ao criar perfil: ${createProfileError.message}`)
    }

    return newProfile
  }

  async function startAuthenticatedSession(authUser, options = {}) {
    const loadedProfile = options.profile ?? await loadProfileForAuthUser(authUser, options)
    let profile = loadedProfile

    try {
      profile = await ensureAdminSalon(loadedProfile, authUser)
    } catch (error) {
      console.error('Erro ao criar salão no primeiro login:', error)
    }

    const user = normalizeUserProfile(profile) ?? createAdminFallbackUser(authUser)
    const salonId = user.salonId ?? null

    setCurrentUser(user)
    setCurrentSalonId(salonId)
    setActivePage(getInitialPageForRole(user.role))
    await loadSalonData(salonId)
    return user
  }

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        if (
          window.localStorage.getItem(sessionPersistenceKey) === 'session' &&
          !window.sessionStorage.getItem(browserSessionKey)
        ) {
          await supabase.auth.signOut()
          setCurrentUser(null)
          return
        }

        const { data } = await supabase.auth.getSession()
        const authUser = data.session?.user
        const email = authUser?.email

        if (!active) return
        if (!email) {
          setCurrentUser(null)
          return
        }

        await startAuthenticatedSession(authUser)
        if (!active) return
      } catch {
        setCurrentUser(null)
      } finally {
        if (active) setAuthChecking(false)
      }
    }

    restoreSession()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('salon-theme', theme)
  }, [theme])

  function notify(text, type = 'success') {
    setToast({ text, type, id: Date.now() })
  }

  async function handleLogin(email, password, keepConnected) {
    try {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim()
      })

      if (loginError) {
        console.error('Erro no Auth:', loginError)
        return { success: false, error: `Erro no login: ${loginError.message}` }
      }

      const authUser = loginData.user
      if (!authUser?.id) return { success: false, error: 'Login sem usuário retornado pelo Auth.' }

      const activeProfile = await loadProfileForAuthUser(authUser, { createMissingProfile: true })

      if (keepConnected) {
        window.localStorage.setItem(sessionPersistenceKey, 'local')
        window.sessionStorage.removeItem(browserSessionKey)
      } else {
        window.localStorage.setItem(sessionPersistenceKey, 'session')
        window.sessionStorage.setItem(browserSessionKey, 'true')
      }

      const user = await startAuthenticatedSession(authUser, { profile: activeProfile })
      if (!user?.salonId) notify('Salão ainda não vinculado.', 'info')
      return { success: true }
    } catch (error) {
      console.error('Erro no fluxo de login:', error)
      return { success: false, error: error.message ?? 'Erro inesperado no login.' }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.localStorage.removeItem(sessionPersistenceKey)
    window.sessionStorage.removeItem(browserSessionKey)
    setCurrentUser(null)
    setCurrentSalonId(null)
    setDatabaseStatus({ notConfigured: false, message: '' })
    clearSalonData()
    setActivePage('dashboard')
    setAgendaProfessional('all')
  }

  function openAgendaForProfessional(name) {
    setAgendaProfessional(name)
    setActivePage('agenda')
  }

  if (authChecking) {
    return <AuthLoadingScreen theme={theme} onThemeChange={setTheme} />
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} theme={theme} onThemeChange={setTheme} />
  }

  const menu = currentUser.role === 'admin' ? adminMenu : currentUser.role === 'professional' ? professionalMenu : cashierMenu
  const allowedPages = menu.map((item) => item.id)
  const safePage = allowedPages.includes(activePage) ? activePage : allowedPages[0]

  return (
    <div className="min-h-screen bg-pearl text-graphite transition-colors dark:bg-[#121016] dark:text-gray-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar user={currentUser} menu={menu} activePage={safePage} salonName={salonSettings.salonName} onNavigate={setActivePage} onLogout={handleLogout} />
        <main className="flex-1 overflow-hidden">
          <Topbar
            title={menu.find((item) => item.id === safePage)?.label ?? 'Atelier'}
            user={currentUser}
            theme={theme}
            onThemeChange={setTheme}
            clients={clients}
            employees={employees}
            appointments={appointments}
            services={serviceItems}
            onNavigate={setActivePage}
          />
          <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            {databaseStatus.message === 'Salão ainda não vinculado.' && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
                Salão ainda não vinculado.
              </div>
            )}
            {databaseStatus.notConfigured && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200">
                {databaseStatus.message}
              </div>
            )}
            <PageErrorBoundary resetKey={safePage}>
              <PageRouter
                page={safePage}
                user={currentUser}
                salonId={currentSalonId}
                databaseStatus={databaseStatus}
                dataLoading={dataLoading}
                appointments={appointments}
                setAppointments={setAppointments}
                clients={clients}
                setClients={setClients}
                cashEntries={cashEntries}
                setCashEntries={setCashEntries}
                cashClosures={cashClosures}
                setCashClosures={setCashClosures}
                advances={advances}
                setAdvances={setAdvances}
                blockedSlots={blockedSlots}
                setBlockedSlots={setBlockedSlots}
                inventoryItems={inventoryItems}
                setInventoryItems={setInventoryItems}
                employees={employees}
                setEmployees={setEmployees}
                services={serviceItems}
                setServices={setServiceItems}
                salonSettings={salonSettings}
                setSalonSettings={setSalonSettings}
                agendaProfessional={agendaProfessional}
                setAgendaProfessional={setAgendaProfessional}
                onOpenAgendaForProfessional={openAgendaForProfessional}
                notify={notify}
              />
            </PageErrorBoundary>
          </section>
        </main>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function LoginScreen({ onLogin, theme, onThemeChange }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keepConnected, setKeepConnected] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await onLogin(email, password, keepConnected)
      if (!result?.success) {
        setError(result?.error ?? 'Erro no login.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f9dde8,transparent_34%),linear-gradient(135deg,#fff9fb,#f7f0ff_55%,#ffffff)] px-4 py-8 text-graphite transition-colors dark:bg-[radial-gradient(circle_at_top_left,rgba(245,191,211,0.16),transparent_34%),linear-gradient(135deg,#121016,#1d1a24_55%,#15131a)] dark:text-gray-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[28px] bg-white shadow-soft dark:border dark:border-white/10 dark:bg-[#1c1922] lg:grid-cols-[1fr_0.92fr]">
          <div className="flex min-h-[520px] flex-col justify-between bg-gradient-to-br from-white via-blush/70 to-lilacSoft/70 p-8 dark:from-[#24202c] dark:via-[#2a2029] dark:to-[#26213a] sm:p-10">
            <div>
              <div className="mb-6 flex justify-end">
                <ThemeToggle theme={theme} onChange={onThemeChange} />
              </div>
              <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm font-semibold text-goldSoft shadow-sm dark:border-white/10 dark:bg-white/10">
                Sistema inteligente para o seu salão
              </div>
              <h1 className="max-w-xl text-4xl font-bold leading-tight text-graphite sm:text-5xl">
                Salão Pro
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-gray-600 dark:text-gray-300">
                Controle agenda, clientes, serviços, caixa, estoque e equipe em uma interface simples para o dia a dia do seu salão.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {['Agenda organizada', 'Controle de caixa', 'Gestão de equipe'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/80 bg-white/70 p-4 text-sm font-semibold shadow-sm dark:border-white/10 dark:bg-white/10">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col justify-center p-8 sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-goldSoft">Entrar</p>
            <h2 className="mt-2 text-3xl font-bold">Acesse sua conta</h2>
            <div className="mt-7 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-600">E-mail</span>
                <input
                  className={inputBase}
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-600">Senha</span>
                <input
                  className={inputBase}
                  type="password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-gray-600 dark:text-gray-300">
              <input
                className="h-4 w-4 rounded border-gray-300 text-graphite focus:ring-graphite"
                checked={keepConnected}
                onChange={(event) => setKeepConnected(event.target.checked)}
                type="checkbox"
              />
              Manter conectado
            </label>
            {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
            <button type="button" onClick={handleLogin} disabled={loading} className={`${buttonPrimary} mt-6 w-full rounded-2xl px-5 py-3`}>
              {loading ? 'Entrando...' : 'Entrar no sistema'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function AuthLoadingScreen({ theme, onThemeChange }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f9dde8,transparent_34%),linear-gradient(135deg,#fff9fb,#f7f0ff_55%,#ffffff)] px-4 py-8 text-graphite transition-colors dark:bg-[radial-gradient(circle_at_top_left,rgba(245,191,211,0.16),transparent_34%),linear-gradient(135deg,#121016,#1d1a24_55%,#15131a)] dark:text-gray-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-soft dark:border dark:border-white/10 dark:bg-[#1c1922]">
          <div className="mb-6 flex justify-end">
            <ThemeToggle theme={theme} onChange={onThemeChange} />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-goldSoft">Salão Pro</p>
          <h1 className="mt-3 text-2xl font-bold">Carregando sessão...</h1>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false, min, step = type === 'number' ? '0.01' : undefined, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-600">{label}</span>
      <input
        className={inputBase}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
        required={required}
        min={min}
        step={step}
        disabled={disabled}
      />
    </label>
  )
}

function Sidebar({ user, menu, activePage, salonName, onNavigate, onLogout }) {
  const displaySalonName = getSidebarSalonName(salonName)

  return (
    <aside className="border-b border-blush/80 bg-white/90 px-4 py-4 shadow-sm dark:border-white/10 dark:bg-[#1a171f]/95 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="flex items-center justify-between gap-4 lg:block">
        <div className="min-w-0 break-words">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-goldSoft">SALÃO</p>
          {displaySalonName && <h1 className="text-xl font-bold text-graphite">{displaySalonName}</h1>}
        </div>
          <button onClick={onLogout} className={`${buttonSecondary} px-3 py-2 lg:hidden`}>
          Sair
        </button>
      </div>
      <nav className="simple-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
        {menu.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`focus-ring min-w-max rounded-2xl px-4 py-3 text-left text-sm font-semibold transition lg:w-full ${
              activePage === item.id ? 'bg-blush text-graphite shadow-sm dark:bg-lilacSoft dark:text-graphite' : 'text-gray-600 hover:bg-pearl dark:text-gray-300 dark:hover:bg-white/10'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-6 hidden rounded-2xl border border-blush bg-pearl p-4 dark:border-white/10 dark:bg-white/5 lg:block">
        <p className="font-semibold">{user.name}</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{user.title}</p>
        <button onClick={onLogout} className={`${buttonSecondary} mt-4 w-full`}>
          Sair
        </button>
      </div>
    </aside>
  )
}

function Topbar({ title, user, theme, onThemeChange, clients, employees, appointments, services, onNavigate }) {
  const [query, setQuery] = useState('')
  const canSearchGlobal = user.role !== 'professional'
  const search = query.trim().toLowerCase()
  const results = canSearchGlobal && search ? [
    ...clients.filter((item) => item.name.toLowerCase().includes(search)).map((item) => ({ label: item.name, detail: 'Cliente', page: 'clientes' })),
    ...services.filter((item) => item.name.toLowerCase().includes(search)).map((item) => ({ label: item.name, detail: 'Serviço', page: 'servicos' })),
    ...employees.filter((item) => item.name.toLowerCase().includes(search)).map((item) => ({ label: item.name, detail: 'Funcionário', page: 'funcionarios' })),
    ...appointments.filter((item) => `${item.client} ${item.service} ${getAppointmentEmployeeName(item, employees)}`.toLowerCase().includes(search)).map((item) => ({ label: `${item.client} · ${item.time}`, detail: `Agenda · ${item.service}`, page: 'agenda' }))
  ].slice(0, 8) : []

  function openResult(page) {
    onNavigate(page)
    setQuery('')
  }

  return (
    <header className="border-b border-blush/70 bg-white/75 px-4 py-4 backdrop-blur dark:border-white/10 dark:bg-[#17141c]/80 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-graphite">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Hoje, {formatDate(todayIso)} · atendimento rápido e organizado</p>
        </div>
        {canSearchGlobal && <div className="relative w-full sm:max-w-xs">
          <input
            className={inputBase}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar clientes, serviços, agenda..."
          />
          {results.length > 0 && (
            <div className="absolute right-0 z-30 mt-2 w-full overflow-hidden rounded-2xl border border-blush bg-white shadow-soft dark:border-white/10 dark:bg-[#24202c]">
              {results.map((result, index) => (
                <button key={`${result.page}-${result.label}-${index}`} type="button" onClick={() => openResult(result.page)} className="block w-full px-4 py-3 text-left text-sm hover:bg-pearl dark:hover:bg-white/10">
                  <span className="block font-bold">{result.label}</span>
                  <span className="text-xs font-semibold text-gray-500">{result.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>}
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle theme={theme} onChange={onThemeChange} />
          <div className="rounded-full border border-blush bg-white px-4 py-2 text-sm font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
            {user.role === 'admin' ? 'Perfil Admin' : user.role === 'professional' ? 'Perfil Profissional' : 'Funcionário Caixa'}
          </div>
        </div>
      </div>
    </header>
  )
}

function ThemeToggle({ theme, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-blush bg-white p-1 text-xs font-bold shadow-sm dark:border-white/10 dark:bg-[#24202c]">
      <button type="button" onClick={() => onChange('light')} className={`rounded-full px-3 py-2 transition ${theme === 'light' ? 'bg-blush text-graphite' : 'text-gray-500 hover:bg-pearl dark:text-gray-300 dark:hover:bg-white/10'}`}>
        Modo claro
      </button>
      <button type="button" onClick={() => onChange('dark')} className={`rounded-full px-3 py-2 transition ${theme === 'dark' ? 'bg-lilacSoft text-graphite' : 'text-gray-500 hover:bg-pearl dark:text-gray-300 dark:hover:bg-white/10'}`}>
        Modo escuro
      </button>
    </div>
  )
}

function PageRouter({ page, user, salonId, databaseStatus, dataLoading, appointments, setAppointments, clients, setClients, cashEntries, setCashEntries, cashClosures, setCashClosures, advances, setAdvances, blockedSlots, setBlockedSlots, inventoryItems, setInventoryItems, employees, setEmployees, services, setServices, salonSettings, setSalonSettings, agendaProfessional, setAgendaProfessional, onOpenAgendaForProfessional, notify }) {
  const employeeAppointments = appointments.filter((item) => getAppointmentEmployeeName(item, employees) === user.name)
  const visibleAppointments = appointments
  const activeClients = clients.filter((client) => client.active)
  const professionals = getProfessionals(employees)

  if (dataLoading) return <DataLoading />

  const pages = {
    dashboard: <AdminDashboard appointments={appointments} employees={employees} clients={clients} cashEntries={cashEntries} advances={advances} />,
    agenda: <Agenda salonId={salonId} appointments={visibleAppointments} setAppointments={setAppointments} user={user} clients={activeClients} employees={professionals} allEmployees={employees} blockedSlots={blockedSlots} setBlockedSlots={setBlockedSlots} cashEntries={cashEntries} setCashEntries={setCashEntries} salonSettings={salonSettings} initialProfessionalFilter={agendaProfessional} onProfessionalFilterChange={setAgendaProfessional} notify={notify} />,
    clientes: <Clients salonId={salonId} user={user} clients={clients} setClients={setClients} appointments={appointments} notify={notify} />,
    servicos: <Services salonId={salonId} user={user} services={services} setServices={setServices} notify={notify} />,
    funcionarios: <Employees salonId={salonId} user={user} employees={employees} setEmployees={setEmployees} appointments={appointments} salonSettings={salonSettings} onOpenAgendaForProfessional={onOpenAgendaForProfessional} notify={notify} />,
    caixa: <CashRegister entries={cashEntries} setEntries={setCashEntries} closures={cashClosures} setClosures={setCashClosures} notify={notify} />,
    vales: user.role === 'admin' || user.role === 'cashier' ? <Advances user={user} employees={employees} advances={advances} setAdvances={setAdvances} setCashEntries={setCashEntries} notify={notify} /> : <AccessDenied />,
    estoque: <Inventory user={user} items={inventoryItems} setItems={setInventoryItems} notify={notify} />,
    relatorios: user.role === 'admin' ? <Reports appointments={appointments} employees={employees} cashEntries={cashEntries} user={user} /> : <AccessDenied />,
    perfil: <EmployeeProfile user={user} appointments={employeeAppointments} employees={employees} setEmployees={setEmployees} />,
    'minha-agenda': <ProfessionalAgenda user={user} appointments={employeeAppointments} employees={employees} blockedSlots={blockedSlots} salonSettings={salonSettings} notify={notify} />,
    configuracoes: user.role === 'admin' ? <Settings salonId={salonId} settings={salonSettings} setSettings={setSalonSettings} notify={notify} /> : <AccessDenied />
  }

  return pages[page] ?? <Agenda salonId={salonId} appointments={visibleAppointments} setAppointments={setAppointments} user={user} clients={activeClients} employees={professionals} allEmployees={employees} blockedSlots={blockedSlots} setBlockedSlots={setBlockedSlots} cashEntries={cashEntries} setCashEntries={setCashEntries} salonSettings={salonSettings} initialProfessionalFilter={agendaProfessional} onProfessionalFilterChange={setAgendaProfessional} notify={notify} />
}

function AdminDashboard({ appointments, employees, clients, cashEntries, advances }) {
  const professionals = getProfessionals(employees)
  const completed = appointments.filter((item) => isCompletedStatus(item.status))
  const dayRevenue = completed.reduce((sum, item) => sum + item.value, 0)
  const monthRevenue = completed.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const commissions = professionals.map((employee) => ({ name: employee.name, value: completed.filter((item) => isAppointmentForEmployee(item, employee)).reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0) }))
  const todayCompleted = completed.filter((item) => item.date === todayIso)
  const dayCommissions = todayCompleted.reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0)
  const monthCommissions = completed.reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0)
  const topClient = topEntries(countBy(completed, (item) => item.client), 1)[0]
  const busyHours = topEntries(countBy(appointments.filter((item) => !isCancelledStatus(item.status)), (item) => item.time?.slice(0, 2) + ':00'))
  const bestWeekday = topEntries(completed.reduce((acc, item) => ({ ...acc, [getWeekdayLabel(item.date)]: (acc[getWeekdayLabel(item.date)] || 0) + Number(item.value ?? 0) }), {}), 1)[0]
  const serviceRevenue = topEntries(completed.reduce((acc, item) => ({ ...acc, [item.service]: (acc[item.service] || 0) + Number(item.value ?? 0) }), {}))
  const serviceSales = topEntries(countBy(completed, (item) => item.service))
  const serviceCommissions = topEntries(completed.reduce((acc, item) => ({ ...acc, [item.service]: (acc[item.service] || 0) + getAppointmentCommission(item, employees) }), {}))
  const dayAdvances = advances.filter((item) => item.date === todayIso).reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const monthAdvances = advances.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const pendingAdvances = advances.filter((item) => item.status !== 'Descontado').reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const dayCashEntries = cashEntries.filter((item) => (item.date ?? item.data) === todayIso || (!item.date && !item.data))
  const cashIncome = dayCashEntries.filter((item) => cashType(item) === 'entrada').reduce((sum, item) => sum + cashValue(item), 0)
  const cashOutcome = dayCashEntries.filter((item) => cashType(item) === 'saída' || cashType(item) === 'saida').reduce((sum, item) => sum + cashValue(item), 0)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Faturamento do dia" value={money.format(dayRevenue)} detail="Concluídos hoje" />
        <Metric title="Faturamento do mês" value={money.format(monthRevenue)} detail="Abril de 2026" />
        <Metric title="Agendamentos de hoje" value={appointments.filter((item) => item.date === todayIso).length} detail="Conforme expediente da equipe" />
        <Metric title="Clientes atendidos" value={completed.length} detail="Serviços finalizados" />
        <Metric title="Comissões do dia" value={money.format(dayCommissions)} detail="Atendimentos concluídos" />
        <Metric title="Comissões do mês" value={money.format(monthCommissions)} detail="Total calculado" />
        <Metric title="Vales do dia" value={money.format(dayAdvances)} detail="Saídas no caixa" />
        <Metric title="Vales do mês" value={money.format(monthAdvances)} detail="Total registrado" />
        <Metric title="Vales pendentes" value={money.format(pendingAdvances)} detail="Ainda não descontados" />
        <Metric title="Saldo líquido do dia" value={money.format(cashIncome - cashOutcome)} detail="Caixa com saídas" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel title="Faturamento semanal">
          <WeeklyRevenueChart appointments={appointments} />
        </Panel>
        <Panel title="Serviços mais vendidos">
          <CompactList items={serviceSales.map(([label, count]) => `${label}: ${count} venda(s)`)} />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Comissão por funcionário">
          <div className="space-y-3">
            {commissions.map((item) => <LineItem key={item.name} label={item.name} value={money.format(item.value)} />)}
          </div>
        </Panel>
        <Panel title="Comissão por serviço">
          <CompactList items={serviceCommissions.length ? serviceCommissions.map(([label, value]) => `${label}: ${money.format(value)}`) : ['Sem comissões calculadas']} />
        </Panel>
        <Panel title="Cliente que mais frequenta">
          <CompactList items={[topClient ? `${topClient[0]}: ${topClient[1]} visita(s)` : 'Sem dados suficientes']} />
        </Panel>
        <Panel title="Horários mais cheios">
          <CompactList items={busyHours.length ? busyHours.map(([label, count]) => `${label}: ${count} agendamento(s)`) : ['Sem dados']} />
        </Panel>
        <Panel title="Dia que mais fatura">
          <CompactList items={[bestWeekday ? `${bestWeekday[0]}: ${money.format(bestWeekday[1])}` : 'Sem dados']} />
        </Panel>
        <Panel title="Serviços mais lucrativos">
          <CompactList items={serviceRevenue.length ? serviceRevenue.map(([label, value]) => `${label}: ${money.format(value)}`) : ['Sem dados']} />
        </Panel>
        <Panel title="Entradas e saídas">
          <LineItem label="Entradas" value={money.format(cashIncome)} positive />
          <LineItem label="Saídas" value={money.format(cashOutcome)} negative />
          <LineItem label="Saldo do dia" value={money.format(cashIncome - cashOutcome)} />
        </Panel>
        <Panel title="Próximos agendamentos">
          <div className="space-y-3">
            {appointments.filter((item) => !isCancelledStatus(item.status)).slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-3 text-sm">
                <p className="font-semibold">{formatDate(item.date)} · {item.time} · {item.client}</p>
                <p className="text-gray-500">{item.service} com {getAppointmentEmployeeName(item, employees)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function WeeklyRevenueChart({ appointments }) {
  const [tooltip, setTooltip] = useState(null)
  const weekDates = getWeekDates(todayIso).slice(1).concat(getWeekDates(todayIso).slice(0, 1))
  const chartData = weekDates.map((date) => {
    const completed = appointments.filter((item) => item.date === date && isCompletedStatus(item.status))
    return {
      date,
      day: getWeekdayLabel(date).replace('.', ''),
      value: completed.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      appointments: completed.length
    }
  })
  const maxRevenue = Math.max(...chartData.map((item) => item.value), 1)

  return (
    <div className="relative">
      <div className="flex h-64 items-end gap-3 rounded-2xl bg-pearl p-4 dark:bg-white/5">
        {chartData.map((item) => (
          <div key={item.date} className="flex h-full flex-1 flex-col justify-end gap-2 text-center text-xs font-semibold text-gray-500">
            <button
              type="button"
              className="relative flex flex-1 items-end rounded-t-2xl focus:outline-none"
              onMouseEnter={() => setTooltip(item)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={() => setTooltip(item)}
              onBlur={() => setTooltip(null)}
            >
              <span
                className="block w-full rounded-t-2xl bg-gradient-to-t from-roseSoft to-lilacSoft transition hover:brightness-105"
                style={{ height: `${Math.max((item.value / maxRevenue) * 100, 4)}%` }}
              />
            </button>
            <span className="capitalize">{item.day}</span>
          </div>
        ))}
      </div>

      {tooltip && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-56 -translate-x-1/2 rounded-2xl border border-blush bg-white p-4 text-sm font-semibold text-graphite shadow-soft dark:border-white/10 dark:bg-[#24202c] dark:text-gray-100">
          <p className="font-bold">{formatDate(tooltip.date).replace('-feira', '')}</p>
          <p className="mt-2">Faturamento: {money.format(tooltip.value)}</p>
          <p>Atendimentos: {tooltip.appointments}</p>
        </div>
      )}
    </div>
  )
}

function Agenda({ salonId, appointments, setAppointments, user, clients, employees, allEmployees = employees, blockedSlots, setBlockedSlots, cashEntries = [], setCashEntries, salonSettings, initialProfessionalFilter = 'all', onProfessionalFilterChange, notify }) {
  const defaultEmployeeName = employees.find((item) => item.active && item.name === user.name)?.name ?? employees.find((item) => item.active)?.name ?? ''
  const createInitialAppointmentForm = () => {
    const employee = employees.find((item) => item.name === defaultEmployeeName)
    const firstService = getCompatibleServicesForProfessional(employee)[0] ?? { name: '', price: 0 }
    return { client: clients[0]?.name ?? '', service: firstService.name, employeeName: defaultEmployeeName, date: todayIso, time: '', paymentMethod: '', value: firstService.price ?? 0 }
  }
  const [form, setForm] = useState(createInitialAppointmentForm)
  const [formMessage, setFormMessage] = useState({ type: '', text: '' })
  const [professionalFilter, setProfessionalFilter] = useState(initialProfessionalFilter)
  const [agendaView, setAgendaView] = useState('day')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const selectedEmployee = employees.find((employee) => employee.name === form.employeeName)
  const filteredProfessional = employees.find((employee) => employee.name === professionalFilter)
  const compatibleServices = getCompatibleServicesForProfessional(selectedEmployee)
  const selectedService = compatibleServices.find((item) => item.name === form.service)
  const availableSlots = getAvailableSlots({ employee: selectedEmployee, date: form.date, service: selectedService, appointments, blockedSlots, salonSettings })
  const filterAvailableSlots = getAvailableSlots({ employee: filteredProfessional, date: form.date, service: selectedService, appointments, blockedSlots, salonSettings })
  const occupiedSlots = getOccupiedSlots({ employee: filteredProfessional, date: form.date, appointments })
  const selectedSlotAvailable = availableSlots.includes(form.time)
  const weekDates = getWeekDates(form.date)
  const visibleAppointments = appointments.filter((item) => (
    (agendaView === 'day' ? item.date === form.date : weekDates.includes(item.date)) &&
    (professionalFilter === 'all' || getAppointmentEmployeeName(item, allEmployees) === professionalFilter)
  ))
  const visibleBlocks = blockedSlots.filter((item) => (
    (agendaView === 'day' ? item.date === form.date : weekDates.includes(item.date)) &&
    (professionalFilter === 'all' || getBlockEmployeeName(item) === professionalFilter)
  ))
  const selectedClient = clients.find((client) => client.name === form.client)
  const selectedClientInsights = selectedClient ? getClientInsights(selectedClient.name, appointments) : null

  function changeAppointmentProfessional(value) {
    setForm((current) => ({ ...current, employeeName: value, service: '', value: 0, time: '' }))
    setFormMessage({ type: '', text: '' })
  }

  useEffect(() => {
    const safeFilter = initialProfessionalFilter === 'all' || employees.some((item) => item.name === initialProfessionalFilter) ? initialProfessionalFilter : 'all'
    setProfessionalFilter(safeFilter)
    if (safeFilter !== 'all') {
      setForm((current) => current.employeeName === safeFilter ? current : { ...current, employeeName: safeFilter, service: '', value: 0, time: '' })
    }
  }, [initialProfessionalFilter, employees])

  function changeProfessionalFilter(value) {
    setProfessionalFilter(value)
    onProfessionalFilterChange?.(value)
    if (value !== 'all') {
      setForm((current) => ({ ...current, employeeName: value, service: '', value: 0, time: '' }))
      setFormMessage({ type: '', text: '' })
    }
  }

  function cashEntriesHasAppointment(appointmentId, entries = cashEntries) {
    return entries.some((entry) => String(cashAppointmentId(entry) ?? '') === String(appointmentId))
  }

  async function ensureCashMovementForCompletedAppointment(appointment) {
    if (!isCompletedStatus(appointment.status) || !appointment.id || cashEntriesHasAppointment(appointment.id)) return null

    const existingMovement = await fetchCashMovementByAppointmentFromSupabase(salonId, appointment.id)
    if (existingMovement) {
      const normalized = normalizeCashMovementRecord(existingMovement)
      setCashEntries((current) => cashEntriesHasAppointment(appointment.id, current) ? current : [...current, normalized])
      return normalized
    }

    const cashPayload = createCompletedAppointmentCashEntry(appointment, allEmployees)
    let savedMovement
    try {
      savedMovement = normalizeCashMovementRecord(await createCashMovementRecord(salonId, cashPayload))
    } catch (error) {
      if (error?.code !== '23505') throw error
      const duplicateMovement = await fetchCashMovementByAppointmentFromSupabase(salonId, appointment.id)
      if (!duplicateMovement) throw error
      savedMovement = normalizeCashMovementRecord(duplicateMovement)
    }
    setCashEntries((current) => cashEntriesHasAppointment(appointment.id, current) ? current : [...current, savedMovement])
    return savedMovement
  }

  async function updateStatus(id, status) {
    const appointment = appointments.find((item) => item.id === id)
    if (!appointment) return false
    if (user.role !== 'admin' && user.role !== 'cashier' && getAppointmentEmployeeName(appointment, allEmployees) !== user.name) return false
    const normalizedStatus = normalizeAppointmentStatus(status)
    const optimistic = normalizeAppointmentRecord({ ...appointment, status: normalizedStatus }, allEmployees)
    setAppointments((current) => current.map((item) => item.id === id ? optimistic : item))
    const selectedPaymentMethod = normalizeAppointmentPaymentMethod(appointment.paymentMethod)
    const updatePayload = isCompletedStatus(normalizedStatus) ? { status: normalizedStatus, paymentMethod: selectedPaymentMethod, payment_method: selectedPaymentMethod || null } : { status: normalizedStatus }
    let saved = optimistic
    try {
      saved = normalizeAppointmentRecord({ ...appointment, ...(await updateAppointmentRecord(salonId, id, updatePayload)) }, allEmployees)
      setAppointments((current) => current.map((item) => item.id === id ? saved : item))
    } catch (error) {
      setAppointments((current) => current.map((item) => item.id === id ? appointment : item))
      handleAgendaDataActionError(error, notify)
      return false
    }

    try {
      if (isCompletedStatus(normalizedStatus)) {
        await ensureCashMovementForCompletedAppointment(saved)
        notify?.('Comissão calculada e lançada no caixa.')
      }
    } catch (error) {
      handleAgendaDataActionError(error, notify)
    }

    try {
      const refreshedRows = await fetchAppointmentsFromSupabase(salonId)
      setAppointments((refreshedRows ?? []).map((item) => normalizeAppointmentRecord(item, allEmployees)))
    } catch (error) {
      handleAgendaDataActionError(error, notify)
      return false
    }
    return true
  }

  async function deleteAppointment(appointment) {
    if (user.role !== 'admin' && user.role !== 'cashier') return false

    if (isCompletedStatus(appointment.status)) {
      if (!window.confirm('Este agendamento já foi concluído. Deseja cancelar em vez de excluir?')) return false
      try {
        const saved = normalizeAppointmentRecord({ ...appointment, ...(await updateAppointmentRecord(salonId, appointment.id, { status: 'cancelado' })) }, allEmployees)
        setAppointments((current) => current.map((item) => item.id === appointment.id ? saved : item))
        notify?.('Agendamento cancelado com sucesso')
        return true
      } catch (error) {
        handleAgendaDataActionError(error, notify)
        return false
      }
    }

    if (!window.confirm('Tem certeza que deseja excluir este agendamento?')) return false
    try {
      await deleteAppointmentRecord(salonId, appointment.id)
      setAppointments((current) => current.filter((item) => item.id !== appointment.id))
      notify?.('Agendamento excluído com sucesso')
      return true
    } catch (error) {
      handleAgendaDataActionError(error, notify)
      return false
    }
  }

  function sendConfirmation(appointment) {
    const client = clients.find((item) => item.name === appointment.client)
    const phone = normalizePhone(client?.phone)
    if (!phone) {
      notify?.('Cliente sem telefone cadastrado.', 'error')
      return
    }
    const message = `Olá ${appointment.client}\nSeu horário está marcado para dia ${formatDate(appointment.date)} às ${appointment.time} com ${getAppointmentEmployeeName(appointment, allEmployees)}.\nServiço: ${appointment.service}\nQualquer dúvida é só avisar`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  function saveBlock(data) {
    if (!data.employeeName || !data.date || !data.start || !data.end || timeToMinutes(data.end) <= timeToMinutes(data.start)) {
      notify?.('Erro ao bloquear: confira profissional, data e Horários.', 'error')
      return
    }
    setBlockedSlots((current) => [...current, { ...data, id: Date.now() }])
    setBlockModalOpen(false)
    notify?.('Horário bloqueado com sucesso.')
  }

  async function saveQuickService(data) {
    if (!data.client.trim() || !data.service || !data.employeeName || Number(data.value) <= 0) {
      notify?.('Erro ao salvar: confira cliente, serviço, profissional e valor.', 'error')
      return
    }
    const professional = employees.find((item) => item.name === data.employeeName)
    const now = new Date()
    const date = getTodayIso()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const selectedQuickService = services.find((item) => item.name === data.service)
    const duration = serviceDurationToMinutes(selectedQuickService, professional?.defaultDuration ?? 60)
    const selectedPaymentMethod = normalizeAppointmentPaymentMethod(data.paymentMethod)
    const appointmentPayload = {
      client: data.client,
      service: data.service,
      serviceName: selectedQuickService?.name ?? data.service,
      service_name: selectedQuickService?.name ?? data.service,
      serviceId: selectedQuickService?.id ?? null,
      service_id: selectedQuickService?.id ?? null,
      employeeName: professional?.name ?? '',
      employee_name: professional?.name ?? '',
      employeeId: professional?.id ?? null,
      employee_id: professional?.id ?? null,
      date,
      time,
      horario: time,
      value: Number(data.value) || 0,
      valor: Number(data.value) || 0,
      duration,
      duracao: duration,
      status: 'concluido',
      paymentMethod: selectedPaymentMethod,
      payment_method: selectedPaymentMethod || null
    }
    try {
      const appointment = normalizeAppointmentRecord(await createAppointmentRecord(salonId, appointmentPayload), allEmployees)
      await ensureCashMovementForCompletedAppointment(appointment)
      setAppointments((current) => [...current, appointment])
      setQuickModalOpen(false)
      notify?.('Atendimento rápido concluído.')
    } catch (error) {
      handleAgendaDataActionError(error, notify)
    }
  }

  async function addAppointment(event) {
    event.preventDefault()
    const requiredFields = [
      ['client', 'cliente'],
      ['service', 'serviço'],
      ['employeeName', 'profissional'],
      ['date', 'data'],
      ['time', 'horário']
    ]
    const missingField = requiredFields.find(([key]) => !String(form[key] ?? '').trim())

    if (missingField) {
      setFormMessage({ type: 'error', text: `Preencha o campo ${missingField[1]} para agendar.` })
      notify?.('Erro ao salvar: confira os campos obrigatórios.', 'error')
      return
    }

    if (!selectedEmployee) {
      setFormMessage({ type: 'error', text: 'Selecione um profissional ativo.' })
      notify?.('Erro ao salvar: selecione um profissional.', 'error')
      return
    }

    if (!selectedService || !isServiceCompatibleWithProfessional(selectedService, selectedEmployee)) {
      setFormMessage({ type: 'error', text: 'Selecione um serviço disponível para a função deste profissional.' })
      notify?.('Erro ao salvar: serviço incompatível com o profissional.', 'error')
      return
    }

    if (!selectedSlotAvailable) {
      setFormMessage({ type: 'error', text: 'Escolha um horário disponível para esta data.' })
      notify?.('Erro ao salvar: horário indisponível.', 'error')
      return
    }

    const duration = serviceDurationToMinutes(selectedService, Number(selectedEmployee.defaultDuration) || 60)
    const value = Number(selectedService?.price ?? form.value)
    const selectedPaymentMethod = normalizeAppointmentPaymentMethod(form.paymentMethod)
    const newAppointmentPayload = {
      client: form.client,
      service: form.service,
      serviceName: selectedService.name,
      service_name: selectedService.name,
      serviceId: selectedService.id,
      service_id: selectedService.id,
      employeeName: selectedEmployee.name,
      employee_name: selectedEmployee.name,
      employeeId: selectedEmployee.id,
      employee_id: selectedEmployee.id,
      date: form.date,
      time: form.time,
      horario: form.time,
      value,
      valor: value,
      duration,
      duracao: duration,
      status: 'agendado',
      paymentMethod: selectedPaymentMethod,
      payment_method: selectedPaymentMethod || null
    }

    try {
      const newAppointment = normalizeAppointmentRecord(await createAppointmentRecord(salonId, newAppointmentPayload), allEmployees)
      setAppointments((current) => [...current, newAppointment])
      setForm({ ...createInitialAppointmentForm(), date: form.date, employeeName: form.employeeName, service: '', value: 0, time: '', paymentMethod: '' })
      setFormMessage({ type: 'success', text: 'Agendamento criado com sucesso!' })
      notify?.('Agendamento criado.')
    } catch (error) {
      handleAgendaDataActionError(error, notify)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Panel title="Novo agendamento">
        <form onSubmit={addAppointment} className="space-y-3">
          <Select
            label="Filtro da agenda"
            value={professionalFilter}
            onChange={changeProfessionalFilter}
            options={['Todos os profissionais', ...employees.map((item) => `${item.name} (${item.workStatus})`)]}
            values={['all', ...employees.map((item) => item.name)]}
          />
          <ClientSearchInput label="Cliente" value={form.client} onChange={(value) => setForm({ ...form, client: value })} clients={clients} />
          {selectedClientInsights && (
            <div className="rounded-2xl border border-blush bg-pearl px-4 py-3 text-sm font-semibold text-gray-700">
              Última visita: {selectedClientInsights.lastVisit}<br />
              Serviço mais comum: {selectedClientInsights.favoriteService}
            </div>
          )}
          <Select label="Serviço" value={form.service} onChange={(value) => {
            const selected = compatibleServices.find((item) => item.name === value)
            setForm({ ...form, service: value, value: selected?.price ?? form.value, time: '' })
          }} options={['Selecione um serviço', ...compatibleServices.map((item) => item.name)]} values={['', ...compatibleServices.map((item) => item.name)]} disabled={!selectedEmployee || compatibleServices.length === 0} />
          {selectedEmployee && compatibleServices.length === 0 && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Nenhum serviço disponível para a função deste profissional.
            </p>
          )}
          <Select label="Profissional" value={form.employeeName} onChange={changeAppointmentProfessional} options={employees.filter((item) => item.active).map((item) => item.name)} />
          <DatePickerBar value={form.date} onChange={(value) => setForm({ ...form, date: value, time: '' })} />
          {selectedEmployee && (
            <div className="rounded-2xl border border-blush bg-pearl px-4 py-3 text-sm font-semibold text-gray-700">
              Expediente: {formatSalonHoursForDate(salonSettings, form.date)}
              {selectedEmployee.breakStart && selectedEmployee.breakEnd ? ` · intervalo ${selectedEmployee.breakStart} às ${selectedEmployee.breakEnd}` : ''}
            </div>
          )}
          <TimeSlotPicker value={form.time} onChange={(value) => setForm({ ...form, time: value })} slots={availableSlots} />
          <Select label="Forma de pagamento" value={form.paymentMethod} onChange={(value) => setForm({ ...form, paymentMethod: value })} options={appointmentPaymentOptions} values={appointmentPaymentValues} />
          {formMessage.text && (
            <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${formMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {formMessage.text}
            </div>
          )}
          <button disabled={!selectedSlotAvailable} className={`${buttonPrimary} w-full rounded-2xl px-4 py-3`}>Agendar</button>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setBlockModalOpen(true)} className={`${buttonSecondary} rounded-2xl px-4 py-3`}>Bloquear horário</button>
            <button type="button" onClick={() => setQuickModalOpen(true)} className={`${buttonSecondary} rounded-2xl border-lilacSoft px-4 py-3 hover:bg-lilacSoft/20 dark:border-lilacSoft/40`}>Atender agora</button>
          </div>
        </form>
      </Panel>
      <div className="space-y-5">
        <AvailabilityPanel employee={filteredProfessional} date={form.date} service={selectedService} salonSettings={salonSettings} availableSlots={filterAvailableSlots} occupiedSlots={occupiedSlots} />
        <Panel title={`Agenda do Salão · ${formatDate(form.date)}`}>
          <div className="mb-4 inline-flex rounded-2xl border border-blush bg-pearl p-1 text-sm font-bold dark:border-white/10 dark:bg-white/5">
            <button type="button" onClick={() => setAgendaView('day')} className={`rounded-xl px-5 py-2 transition ${agendaView === 'day' ? 'bg-graphite text-white shadow-sm dark:bg-lilacSoft dark:text-graphite' : 'hover:bg-white dark:hover:bg-white/10'}`}>Dia</button>
            <button type="button" onClick={() => setAgendaView('week')} className={`rounded-xl px-5 py-2 transition ${agendaView === 'week' ? 'bg-graphite text-white shadow-sm dark:bg-lilacSoft dark:text-graphite' : 'hover:bg-white dark:hover:bg-white/10'}`}>Semana</button>
          </div>
          {agendaView === 'week' && <WeeklyAgenda weekDates={weekDates} appointments={visibleAppointments} blocks={visibleBlocks} employees={employees} user={user} onStatusChange={updateStatus} onSendConfirmation={sendConfirmation} onDeleteAppointment={deleteAppointment} />}
          {agendaView === 'day' && (
          <div className="simple-scrollbar max-h-[720px] space-y-3 overflow-auto pr-1">
            {visibleBlocks.map((block) => (
              <div key={block.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="text-lg font-bold">{block.start} às {block.end} · Horário bloqueado</p>
                <p className="mt-1">{getBlockEmployeeName(block)} · {block.reason}</p>
              </div>
            ))}
            {[...visibleAppointments].sort((a, b) => getAppointmentSortKey(a).localeCompare(getAppointmentSortKey(b))).map((item) => (
              <div key={item.id} className={`${cardBase} p-4`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{formatDate(item.date)} · {item.time} · {item.client}</p>
                    <p className="mt-1 text-sm text-gray-600">{item.service} com {getAppointmentEmployeeName(item, allEmployees)}</p>
                    <p className="mt-2 text-sm text-gray-500">Duração: {getAppointmentDuration(item, allEmployees.find((employee) => isAppointmentForEmployee(item, employee)))} min</p>
                    {user.role === 'admin' && <p className="mt-2 text-sm font-semibold text-goldSoft">{money.format(item.value)}</p>}
                    {isCompletedStatus(item.status) && <p className="mt-1 text-sm font-semibold text-emerald-700">Comissão: {money.format(getAppointmentCommission(item, allEmployees))}</p>}
                  </div>
                  <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => sendConfirmation(item)} className={`${buttonSecondary} rounded-full px-3 py-2`}>Enviar confirmação</button>
                    <select className={`focus-ring min-w-[130px] rounded-full border px-3 py-2 text-sm font-semibold ${statusStyles[normalizeAppointmentStatus(item.status)]}`} value={normalizeAppointmentStatus(item.status)} onChange={(event) => updateStatus(item.id, event.target.value)}>
                      {appointmentStatusOptions.map((status) => <option key={status} value={status}>{formatAppointmentStatus(status)}</option>)}
                    </select>
                    {(user.role === 'admin' || user.role === 'cashier') && <button type="button" onClick={() => deleteAppointment(item)} className={`${buttonDanger} rounded-full px-3 py-2`}>Excluir</button>}
                  </div>
                </div>
              </div>
            ))}
            {visibleAppointments.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-pearl px-4 py-5 text-sm font-semibold text-gray-600">
                Nenhum agendamento para este filtro.
              </div>
            )}
          </div>
          )}
        </Panel>
      </div>
      {blockModalOpen && <BlockTimeModal user={user} employees={employees} date={form.date} onClose={() => setBlockModalOpen(false)} onSave={saveBlock} />}
      {quickModalOpen && <QuickServiceModal clients={clients} employees={employees} onClose={() => setQuickModalOpen(false)} onSave={saveQuickService} />}
    </div>
  )
}

function WeeklyAgenda({ weekDates, appointments, blocks, employees, user, onStatusChange, onSendConfirmation, onDeleteAppointment }) {
  const [selectedItem, setSelectedItem] = useState(null)
  const weeklyStatusStyles = {
    agendado: 'border-amber-200 bg-amber-50 text-amber-900',
    confirmado: 'border-sky-200 bg-sky-50 text-sky-900',
    concluido: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    cancelado: 'border-rose-200 bg-rose-50 text-rose-900'
  }

  return (
    <>
      <div className="simple-scrollbar overflow-x-auto pb-2">
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {weekDates.map((date) => {
            const dayAppointments = appointments.filter((item) => item.date === date).sort((a, b) => getAppointmentSortKey(a).localeCompare(getAppointmentSortKey(b)))
            const dayBlocks = blocks.filter((item) => item.date === date)
            const [weekday, fullDate] = formatDate(date).split(', ')
            const shortDate = fullDate?.slice(0, 5) ?? ''
            return (
              <div key={date} className="rounded-2xl border border-gray-100 bg-pearl dark:border-white/10 dark:bg-white/5">
                <div className="sticky top-0 z-10 rounded-t-2xl border-b border-gray-100 bg-white px-3 py-3 dark:border-white/10 dark:bg-[#1f1b26]">
                  <p className="text-sm font-extrabold capitalize">{weekday?.slice(0, 3)}</p>
                  <p className="text-xs font-semibold text-gray-500">{shortDate}</p>
                </div>
                <div className="simple-scrollbar h-[500px] space-y-2 overflow-y-auto p-3">
                  {dayBlocks.map((block) => (
                    <div key={block.id} className="rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/10 dark:text-gray-200">
                      <p className="font-bold">{block.start}-{block.end}</p>
                      <p>Bloqueado</p>
                    </div>
                  ))}
                  {dayAppointments.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className={`block w-full rounded-xl border px-3 py-2 text-left text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${weeklyStatusStyles[normalizeAppointmentStatus(item.status)] ?? weeklyStatusStyles.agendado}`}
                    >
                      <p className="font-extrabold">{item.time}</p>
                      <p className="mt-1 truncate font-bold">{item.client}</p>
                      <p className="truncate opacity-80">{item.service}</p>
                    </button>
                  ))}
                  {dayAppointments.length === 0 && dayBlocks.length === 0 && (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs font-semibold text-gray-500 dark:border-white/10">Livre</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedItem && (
        <Modal title="Detalhes do agendamento" onClose={() => setSelectedItem(null)}>
          <div className="space-y-3 text-sm">
            <p><strong>Data:</strong> {formatDate(selectedItem.date)}</p>
            <p><strong>Horário:</strong> {selectedItem.time}</p>
            <p><strong>Cliente:</strong> {selectedItem.client}</p>
            <p><strong>Serviço:</strong> {selectedItem.service}</p>
            <p><strong>Profissional:</strong> {getAppointmentEmployeeName(selectedItem, employees)}</p>
            <p><strong>Duração:</strong> {getAppointmentDuration(selectedItem, employees.find((employee) => isAppointmentForEmployee(selectedItem, employee)))} min</p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button type="button" onClick={() => onSendConfirmation(selectedItem)} className={buttonSecondary}>Enviar confirmação</button>
              {(user.role === 'admin' || user.role === 'cashier' || getAppointmentEmployeeName(selectedItem, employees) === user.name) && (
                <select className={`focus-ring min-w-[130px] rounded-xl border px-3 py-2 text-sm font-semibold ${statusStyles[normalizeAppointmentStatus(selectedItem.status)]}`} value={normalizeAppointmentStatus(selectedItem.status)} onChange={(event) => { onStatusChange(selectedItem.id, event.target.value); setSelectedItem({ ...selectedItem, status: event.target.value }) }}>
                  {appointmentStatusOptions.map((status) => <option key={status} value={status}>{formatAppointmentStatus(status)}</option>)}
                </select>
              )}
              {(user.role === 'admin' || user.role === 'cashier') && (
                <button type="button" onClick={() => { if (onDeleteAppointment(selectedItem)) setSelectedItem(null) }} className={buttonDanger}>Excluir</button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function BlockTimeModal({ user, employees, date, onClose, onSave }) {
  const options = user.role === 'admin' || user.role === 'cashier' ? employees.map((item) => item.name) : [user.name]
  const [form, setForm] = useState({ employeeName: options[0] ?? '', date, start: '09:00', end: '10:00', reason: 'Horário bloqueado' })

  return (
    <Modal title="Bloquear horário" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Select label="Profissional" value={form.employeeName} onChange={(value) => setForm({ ...form, employeeName: value })} options={options} />
        <Field label="Data" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Horário inicial" type="time" value={form.start} onChange={(value) => setForm({ ...form, start: value })} />
          <Field label="Horário final" type="time" value={form.end} onChange={(value) => setForm({ ...form, end: value })} />
        </div>
        <Select label="Motivo" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} options={['Funcionário vai sair mais cedo', 'Cliente VIP reservado', 'Manutenção', 'Horário bloqueado']} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button className={buttonPrimary}>Bloquear</button>
        </div>
      </form>
    </Modal>
  )
}

function QuickServiceModal({ clients, employees, onClose, onSave }) {
  const firstService = services[0] ?? { name: '', price: 0 }
  const [form, setForm] = useState({ client: clients[0]?.name ?? '', service: firstService.name, employeeName: employees.find((item) => item.active)?.name ?? '', paymentMethod: 'pix', value: firstService.price })

  return (
    <Modal title="Atender agora" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <ClientSearchInput label="Cliente ou nome avulso" value={form.client} onChange={(value) => setForm({ ...form, client: value })} clients={clients} />
        <Select label="Serviço" value={form.service} onChange={(value) => {
          const selected = services.find((item) => item.name === value)
          setForm({ ...form, service: value, value: selected?.price ?? form.value })
        }} options={services.map((item) => item.name)} />
        <Select label="Profissional" value={form.employeeName} onChange={(value) => setForm({ ...form, employeeName: value })} options={employees.filter((item) => item.active).map((item) => item.name)} />
        <Select label="Forma de pagamento" value={form.paymentMethod} onChange={(value) => setForm({ ...form, paymentMethod: value })} options={appointmentPaymentOptions} values={appointmentPaymentValues} />
        <Field label="Valor" type="number" value={form.value} onChange={(value) => setForm({ ...form, value })} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button className={buttonPrimary}>Salvar atendimento</button>
        </div>
      </form>
    </Modal>
  )
}

function DatePickerBar({ value, onChange }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-gray-600">Data</span>
      <div className="grid grid-cols-[44px_1fr_44px_auto] gap-2">
        <button type="button" onClick={() => onChange(shiftDate(value, -1))} className={`${buttonSecondary} px-3 py-2 text-lg`} aria-label="Dia anterior">
          &lt;
        </button>
        <label className="relative block">
          <input
            className={`${inputBase} h-full rounded-xl px-3 py-2 text-center text-sm font-bold`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            type="date"
          />
        </label>
        <button type="button" onClick={() => onChange(shiftDate(value, 1))} className={`${buttonSecondary} px-3 py-2 text-lg`} aria-label="Próximo dia">
          &gt;
        </button>
        <button type="button" onClick={() => onChange(getTodayIso())} className={buttonSecondary}>
          Hoje
        </button>
      </div>
      <p className="mt-2 text-xs font-semibold text-gray-500">Selecionado: {formatDate(value)}</p>
    </div>
  )
}

function AvailabilityPanel({ employee, date, service, salonSettings, availableSlots, occupiedSlots }) {
  if (!employee) {
    return (
      <Panel title="Disponibilidade do profissional">
        <div className="rounded-2xl border border-gray-100 bg-pearl px-4 py-5 text-sm font-semibold text-gray-600">
          Selecione um profissional no filtro para consultar Horários livres e ocupados.
        </div>
      </Panel>
    )
  }

  const dayOff = employee.workStatus === 'De folga'
  const lunchNow = employee.workStatus === 'Horário de almoço'
  const salonClosed = !getSalonHoursForDate(salonSettings, date)

  return (
    <Panel title="Disponibilidade do profissional">
      <div className="space-y-4">
        <div className="rounded-2xl border border-blush bg-pearl p-4 text-sm">
          <p><strong>Profissional:</strong> {employee.name}</p>
          <p className="mt-1"><strong>Data:</strong> {formatDate(date)}</p>
          <p className="mt-1"><strong>Salão:</strong> {formatSalonHoursForDate(salonSettings, date)}</p>
          <p className="mt-1"><strong>Trabalho:</strong> {employee.workStart} às {employee.workEnd}</p>
          <p className="mt-1"><strong>Intervalo:</strong> {employee.breakStart && employee.breakEnd ? `${employee.breakStart} às ${employee.breakEnd}` : 'Sem intervalo cadastrado'}</p>
          <p className="mt-1"><strong>Serviço base:</strong> {service?.name ?? 'Não selecionado'}</p>
        </div>

        {dayOff && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            Este profissional está de folga nesta data
          </div>
        )}

        {salonClosed && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            O salão não funciona nesta data
          </div>
        )}

        {lunchNow && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Este profissional está em horário de almoço neste momento
          </div>
        )}

        <div>
          <h4 className="mb-2 text-sm font-bold text-graphite">Ocupados</h4>
          {occupiedSlots.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm font-semibold text-gray-600">Nenhum horário ocupado nesta data.</p>
          ) : (
            <div className="space-y-2">
              {occupiedSlots.map((appointment) => (
                <div key={appointment.id} className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm">
                  <p className="font-bold text-rose-800">{appointment.time} - {appointment.client} - {appointment.service}</p>
                  <p className="mt-1 text-rose-700">Duração: {getAppointmentDuration(appointment, employee)} min · {formatAppointmentStatus(appointment.status)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-bold text-graphite">Disponíveis</h4>
          {salonClosed ? (
            <p className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm font-semibold text-gray-600">Sem horários disponíveis fora do funcionamento do salão.</p>
          ) : dayOff ? (
            <p className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm font-semibold text-gray-600">Sem Horários disponíveis por folga.</p>
          ) : availableSlots.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm font-semibold text-gray-600">Sem Horários disponíveis nesta data.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableSlots.map((slot) => (
                <span key={slot} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{slot}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

function TimeSlotPicker({ value, onChange, slots }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-gray-600">Horário disponível</span>
      {slots.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-pearl px-4 py-3 text-sm font-semibold text-gray-600">
          Sem Horários disponíveis nesta data
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => onChange(slot)}
              className={`focus-ring rounded-xl border px-3 py-2 text-sm font-bold transition ${
                value === slot ? 'border-graphite bg-graphite text-white' : 'border-blush bg-white text-graphite hover:bg-pearl'
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ClientSearchInput({ label, value, onChange, clients }) {
  const [focused, setFocused] = useState(false)
  const query = value.trim().toLowerCase()
  const suggestions = query ? clients.filter((client) => {
    const name = client.name.toLowerCase()
    return name.startsWith(query) || name.includes(query)
  }).slice(0, 5) : []

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-gray-600">{label}</span>
        <input className={inputBase} value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => setFocused(true)} placeholder="Digite o nome da cliente" />
      </label>
      {focused && suggestions.length > 0 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-blush bg-white shadow-soft dark:border-white/10 dark:bg-[#24202c]">
          {suggestions.map((client) => (
            <button key={client.id} type="button" onMouseDown={() => { onChange(client.name); setFocused(false) }} className="block w-full px-4 py-3 text-left text-sm font-semibold text-graphite hover:bg-pearl dark:text-gray-100 dark:hover:bg-white/10">
              <span className="block text-graphite">{client.name}</span>
              <span className="text-xs font-medium text-gray-500">{client.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Clients({ salonId, user, clients, setClients, appointments, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const canEdit = user.role === 'admin' || user.role === 'cashier'
  const canDeactivate = user.role === 'admin'

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(client) {
    setEditing(client)
    setModalOpen(true)
  }

  async function saveClient(data) {
    if (!data.name.trim() || !data.phone.trim()) {
      notify?.('Erro ao salvar: informe nome e telefone do cliente.', 'error')
      return
    }
    try {
      if (editing) {
        const saved = normalizeClientRecord(await updateClientRecord(salonId, editing.id, data))
        setClients((current) => current.map((client) => client.id === editing.id ? saved : client))
      } else {
        const saved = normalizeClientRecord(await createClientRecord(salonId, { ...data, history: [], lastVisit: 'Novo cadastro', active: true }))
        setClients((current) => [...current, saved])
      }
      setModalOpen(false)
      notify?.('Cliente salvo.')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  async function toggleClient(client) {
    try {
      const saved = normalizeClientRecord(await updateClientRecord(salonId, client.id, { active: !client.active }))
      setClients((current) => current.map((item) => item.id === client.id ? saved : item))
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Clientes cadastrados</h3>
          <p className="text-sm text-gray-500">Admin e Funcionários podem cadastrar e editar clientes.</p>
        </div>
        <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>Novo Cliente</button>
      </div>
      <CardsGrid items={clients} render={(item) => (
        <>
          {(() => {
            const insights = getClientInsights(item.name, appointments)
            return (
              <>
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg font-bold">{item.name}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
          </div>
          <p className="text-sm text-gray-500">{item.phone} · Aniv. {item.birthday}</p>
          <p className="mt-3 text-sm text-gray-600">{item.notes}</p>
          <p className="mt-3 text-sm"><strong>Histórico:</strong> {(item.history?.length ? item.history : ['Sem histórico']).join(', ')}</p>
          <p className="mt-2 text-sm text-goldSoft">Última visita: {formatDate(item.lastVisit)}</p>
          <div className="mt-3 rounded-2xl border border-blush bg-pearl px-4 py-3 text-sm">
            <p><strong>Serviço mais comum:</strong> {insights.favoriteService}</p>
            <p><strong>Total de visitas:</strong> {insights.visitCount}</p>
            <p><strong>Ticket médio:</strong> {money.format(insights.averageTicket)}</p>
            <p className="mt-1 text-gray-600">Esse cliente costuma fazer {insights.favoriteService}.</p>
          </div>
          {canEdit && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => openEdit(item)} className={buttonSecondary}>Editar Cliente</button>
              {canDeactivate && <button onClick={() => toggleClient(item)} className={buttonSecondary}>{item.active ? 'Desativar' : 'Ativar'}</button>}
            </div>
          )}
              </>
            )
          })()}
        </>
      )} />
      {modalOpen && <ClientModal client={editing} canChangeStatus={canDeactivate} onClose={() => setModalOpen(false)} onSave={saveClient} />}
    </div>
  )
}

function ClientModal({ client, canChangeStatus, onClose, onSave }) {
  const [form, setForm] = useState(client ? { name: client.name, phone: client.phone, birthday: client.birthday, notes: client.notes, active: client.active } : { name: '', phone: '', birthday: '', notes: '', active: true })
  return (
    <Modal title={client ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Field label="Nome" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Field label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required />
        <Field label="Aniversário" value={form.birthday} onChange={(value) => setForm({ ...form, birthday: value })} placeholder="dd/mm" />
        <label className="block"><span className="mb-2 block text-sm font-semibold text-gray-600 dark:text-gray-300">Observações</span><textarea className={`${inputBase} min-h-24`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        {client && canChangeStatus && <Toggle label="Status ativo" checked={form.active} onChange={(checked) => setForm({ ...form, active: checked })} />}
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button><button className={buttonPrimary}>Salvar</button></div>
      </form>
    </Modal>
  )
}
function Services({ salonId, user, services, setServices, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const canManage = user.role === 'admin'

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setModalOpen(true)
  }

  async function saveService(data) {
    const selectedFunctions = toList(data.category).filter((option) => employeeFunctionOptions.includes(option))
    const payload = {
      ...data,
      name: data.name.trim(),
      price: Number(data.price) || 0,
      category: selectedFunctions.join(', '),
      commissionPercent: Number(data.commissionPercent ?? data.commission_percent ?? 0) || 0,
      responsible: ''
    }
    if (!payload.name) {
      notify?.('Erro ao salvar: informe o nome do serviço.', 'error')
      return
    }
    if (!payload.category) {
      notify?.('Erro ao salvar: selecione a função que realiza o serviço.', 'error')
      return
    }
    try {
      if (editing) {
        await updateServiceRecord(salonId, editing.id, payload)
      } else {
        await createServiceRecord(salonId, payload)
      }

      const serviceRows = await fetchServicesFromSupabase(salonId)
      setServices((serviceRows ?? []).map(normalizeServiceRecord))
      setModalOpen(false)
      notify?.('Serviço salvo com sucesso.')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  async function removeService(item) {
    if (!window.confirm(`Remover o serviço "${item.name}"?`)) return
    try {
      await deleteServiceRecord(salonId, item.id)
      setServices((current) => current.filter((service) => service.id !== item.id))
      notify?.('Serviço removido.')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Serviços</h3>
          <p className="text-sm text-gray-500">{canManage ? 'Cadastre e ajuste os serviços do Salão.' : 'Consulta dos serviços cadastrados.'}</p>
        </div>
        {canManage && <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>Novo Serviço</button>}
      </div>
      <CardsGrid items={services} render={(item) => (
        <>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <p className="min-w-0 break-words text-lg font-bold">{item.name}</p>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-4 py-2 text-base font-bold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300">{money.format(item.price)}</span>
          </div>
          <p className="mt-2 text-sm text-gray-600">Comissão: <strong>{Number(item.commission_percent ?? item.commissionPercent ?? 0)}%</strong></p>
          <p className="mt-2 text-sm text-gray-600">Duração: <strong>{item.duration}</strong></p>
          <p className="mt-3 text-sm">Funções que realizam: <strong>{formatServiceFunctions(item.category) || 'Não informado'}</strong></p>
          {canManage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => openEdit(item)} className={buttonSecondary}>Editar</button>
              <button onClick={() => removeService(item)} className={buttonDanger}>Remover</button>
            </div>
          )}
        </>
      )} />
      {modalOpen && <ServiceModal service={editing} onClose={() => setModalOpen(false)} onSave={saveService} />}
    </div>
  )
}

function ServiceModal({ service, onClose, onSave }) {
  const [form, setForm] = useState(service ? {
    name: service.name,
    price: service.price,
    duration: service.duration,
    category: service.category,
    commissionPercent: service.commissionPercent ?? service.commission_percent ?? 0
  } : { name: '', price: 0, duration: '1h', category: '', commissionPercent: 0 })
  const selectedFunctions = toList(form.category).filter((option) => employeeFunctionOptions.includes(option))

  function toggleFunction(option) {
    setForm((current) => {
      const currentFunctions = toList(current.category).filter((item) => employeeFunctionOptions.includes(item))
      const nextFunctions = currentFunctions.includes(option)
        ? currentFunctions.filter((item) => item !== option)
        : [...currentFunctions, option]
      return {
        ...current,
        category: nextFunctions.join(', ')
      }
    })
  }

  return (
    <Modal title={service ? 'Editar serviço' : 'Novo serviço'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Field label="Nome do serviço" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor" type="number" min="0" value={form.price} onChange={(value) => setForm({ ...form, price: value })} required />
          <Field label="Duração" value={form.duration} onChange={(value) => setForm({ ...form, duration: value })} placeholder="Ex.: 1h 30min" required />
        </div>
        <Field label="Comissão do profissional (%)" type="number" min="0" max="100" step="0.01" value={form.commissionPercent} onChange={(value) => setForm({ ...form, commissionPercent: value })} />
        <CheckboxGroup
          label="Função que realiza"
          options={employeeFunctionOptions}
          selected={selectedFunctions}
          onToggle={toggleFunction}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button className={buttonPrimary}>Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function Employees({ salonId, user, employees = [], setEmployees, appointments, salonSettings, onOpenAgendaForProfessional, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const canManage = user.role === 'admin'

  function openNew() {
    if (!canManage) return
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(employee) {
    if (!canManage) return
    setEditing(employee)
    setModalOpen(true)
  }

  async function saveEmployee(data) {
    const employeeType = 'professional'
    const selectedFunctions = toList(data.selectedFunctions ?? data.role)
      .filter((option) => employeeFunctionOptions.includes(option))
    const employeeFunctions = selectedFunctions.join(', ')
    const wantsLogin = Boolean(data.loginActive)
    const loginEmail = data.accessEmail?.trim().toLowerCase() ?? ''
    const temporaryPassword = data.temporaryPassword?.trim() ?? ''
    const employeeName = data.name.trim()
    if (!data.name.trim() || !data.phone.trim() || !employeeFunctions) {
      notify?.('Erro ao salvar: informe nome, telefone e função.', 'error')
      return
    }
    if (wantsLogin && !salonId) {
      notify?.('Erro ao salvar: admin sem salão vinculado.', 'error')
      return
    }
    const existingLoginEmail = editing?.accessEmail?.trim().toLowerCase() ?? ''
    const shouldCreateLogin = wantsLogin && (!editing?.loginActive || existingLoginEmail !== loginEmail)
    if (wantsLogin && !loginEmail) {
      notify?.('Erro ao salvar: informe e-mail de acesso.', 'error')
      return
    }
    if (shouldCreateLogin && !temporaryPassword) {
      notify?.('Erro ao salvar: informe a senha do login.', 'error')
      return
    }
    const payload = {
      ...data,
      employeeType,
      role: employeeFunctions,
      position: employeeFunctions,
      commission: Number(data.commission) || 0,
      defaultDuration: Number(data.defaultDuration) || 60,
      scheduleInterval: Number(data.scheduleInterval) || Number(data.defaultDuration) || 60,
      workStart: data.workStart ?? '09:00',
      workEnd: data.workEnd ?? '18:00',
      breakStart: data.breakStart ?? '',
      breakEnd: data.breakEnd ?? '',
      accessEmail: loginEmail,
      temporaryPassword,
      loginActive: wantsLogin && !shouldCreateLogin,
      serviceCommissions: toObjectList(data.serviceCommissions).map((item, index) => ({
        ...item,
        id: item.id ?? Date.now() + index,
        value: Number(item.value) || 0
      })),
      services: toList(data.services)
    }
    delete payload.selectedFunctions
    delete payload.servicesText
    try {
      let saved
      if (editing) {
        saved = normalizeEmployeeRecord(await updateEmployeeRecord(salonId, editing.id, payload))
      } else {
        saved = normalizeEmployeeRecord(await createEmployeeRecord(salonId, payload))
        setEmployees((current) => [...current, saved])
      }

      if (shouldCreateLogin) {
        try {
          const response = await fetch('/api/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: loginEmail,
              password: temporaryPassword,
              name: employeeName,
              salon_id: salonId,
              role: employeeType === 'cashier' ? 'caixa' : 'profissional'
            })
          })

          const result = await response.json()

          if (!response.ok) {
            console.error("Erro API create-user:", result)
            throw new Error(result.error || "Erro ao criar login")
          }

        } catch (loginError) {
          notify?.('Funcionário salvo, mas erro ao criar login', 'error')
          setModalOpen(false)
          return
        }

        const savedWithLogin = normalizeEmployeeRecord(await updateEmployeeRecord(salonId, saved.id, {
          login_email: loginEmail,
          login_status: 'ativo'
        }))
        setEmployees((current) => current.map((employee) => employee.id === saved.id ? savedWithLogin : employee))
      }

      if (editing) {
        const employeeRows = await fetchEmployeesFromSupabase(salonId)
        setEmployees((employeeRows ?? []).map(normalizeEmployeeRecord))
      }

      setModalOpen(false)
      notify?.(editing ? 'Funcionário atualizado com sucesso.' : shouldCreateLogin ? 'Funcionário e login criados com sucesso' : 'Funcionário salvo com sucesso')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  async function deactivateEmployee(employee) {
    if (!canManage) return
    if (!employee.active) return
    try {
      const saved = normalizeEmployeeRecord(await updateEmployeeRecord(salonId, employee.id, { active: false }))
      setEmployees((current) => current.map((item) => item.id === employee.id ? saved : item))
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  async function removeEmployee(employee) {
    if (!canManage) return
    const isCurrentUser = employee.id === user.employeeId ||
      employee.name === user.name ||
      employee.accessEmail?.toLowerCase() === user.email?.toLowerCase()

    if (isCurrentUser) {
      notify?.('Você não pode remover seu próprio usuário', 'error')
      return
    }

    if (!window.confirm('Tem certeza que deseja remover este funcionário?')) return

    const hasLinkedFutureAppointments = appointments.some((appointment) => (
      isAppointmentForEmployee(appointment, employee) &&
      !isCancelledStatus(appointment.status) &&
      (appointment.date ?? '') >= todayIso
    ))

    if (hasLinkedFutureAppointments) {
      if (!window.confirm('Este funcionário possui agendamentos vinculados. Deseja apenas desativá-lo?')) return
      try {
        const saved = normalizeEmployeeRecord(await updateEmployeeRecord(salonId, employee.id, { active: false }))
        setEmployees((current) => current.map((item) => item.id === employee.id ? saved : item))
        notify?.('Funcionário desativado com sucesso')
      } catch (error) {
        handleDataActionError(error, notify)
      }
      return
    }

    try {
      const loginUserId = employee.userId ?? employee.user_id ?? ''
      const loginEmail = employee.accessEmail ?? employee.login_email ?? ''
      const hasLogin = Boolean(loginUserId || loginEmail)

      if (hasLogin) {
        const response = await fetch('/api/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: loginUserId,
            email: loginEmail
          })
        })

        const result = await response.json()

        if (!response.ok) {
          console.error('Erro API delete-user:', result)
          throw new Error(result.error || 'Erro ao remover login')
        }
      }

      await deleteEmployeeRecord(salonId, employee.id)
      setEmployees((current) => current.filter((item) => item.id !== employee.id))
      notify?.(hasLogin ? 'Funcionário e login removidos com sucesso.' : 'Funcionário removido com sucesso')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Equipe do Salão</h3>
          <p className="text-sm text-gray-500">{canManage ? 'Cadastro e edição disponíveis para Admin/Dono.' : 'Funcionário Caixa pode visualizar comissões, sem alterar.'}</p>
        </div>
        {canManage && <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3 sm:shrink-0`}>Novo Funcionário</button>}
      </div>
      <CardsGrid items={employees || []} render={(item) => (
        <div className="min-w-0 space-y-3 break-words">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <button onClick={() => isProfessional(item) && onOpenAgendaForProfessional?.(item.name)} className={`min-w-0 whitespace-normal break-words text-left text-lg font-bold leading-snug text-graphite ${isProfessional(item) ? 'hover:text-goldSoft' : 'cursor-default'}`}>
              {item.name}
            </button>
            <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-bold ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
          </div>
          <p className="min-w-0 text-sm text-gray-500">{item.phone}</p>
          <p className="min-w-0 text-sm text-gray-600">Funções: <strong>{formatEmployeeFunctions(item.role) || 'Não informado'}</strong></p>
          <p className="min-w-0 text-sm text-gray-600">Login: <strong>{item.loginActive ? 'ativo' : 'inativo'}</strong></p>
          {canManage && <div className="mt-4 flex min-w-0 flex-wrap gap-2"><button onClick={() => openEdit(item)} className={buttonSecondary}>Editar</button><button onClick={() => deactivateEmployee(item)} disabled={!item.active} className={buttonSecondary}>Desativar</button><button onClick={() => removeEmployee(item)} className={buttonDanger}>Remover</button></div>}
        </div>
      )} />
      {modalOpen && <EmployeeModal employee={editing} salonSettings={salonSettings} onClose={() => setModalOpen(false)} onSave={saveEmployee} />}
    </div>
  )
}

function EmployeeModal({ employee, salonSettings, onClose, onSave }) {
  const defaultAccessEmail = employee?.accessEmail ?? getSuggestedAccessEmail({ name: employee?.name, employeeType: 'professional', salonSettings })
  const [form, setForm] = useState(employee ? {
    ...employee,
    employeeType: 'professional',
    role: formatEmployeeFunctions(employee.role),
    workStatus: employee.workStatus ?? 'Ativo',
    workStart: employee.workStart ?? '09:00',
    workEnd: employee.workEnd ?? '18:00',
    breakStart: employee.breakStart ?? '',
    breakEnd: employee.breakEnd ?? '',
    accessEmail: defaultAccessEmail,
    temporaryPassword: employee.temporaryPassword ?? '',
    loginActive: employee.loginActive ?? false,
    defaultDuration: employee.defaultDuration ?? 60,
    scheduleInterval: employee.scheduleInterval ?? employee.defaultDuration ?? 60,
    serviceCommissions: toObjectList(employee.serviceCommissions),
    services: toList(employee.services)
  } : { name: '', phone: '', role: '', employeeType: 'professional', accessEmail: getSuggestedAccessEmail({ employeeType: 'professional', salonSettings }), temporaryPassword: '', loginActive: true, commission: 0, serviceCommissions: [], services: [], active: true, workStatus: 'Ativo', workStart: '09:00', workEnd: '18:00', breakStart: '', breakEnd: '', defaultDuration: 60, scheduleInterval: 60 })
  const [selectedFunctions, setSelectedFunctions] = useState(() => (
    toList(employee ? employee.role : '').filter((option) => employeeFunctionOptions.includes(option))
  ))
  const suggestedAccessEmail = getSuggestedAccessEmail({ name: form.name, employeeType: 'professional', salonSettings })

  function updateName(name) {
    const previousSuggestion = getSuggestedAccessEmail({ name: form.name, employeeType: 'professional', salonSettings })
    setForm((current) => ({
      ...current,
      name,
      accessEmail: !current.accessEmail || current.accessEmail === previousSuggestion
        ? getSuggestedAccessEmail({ name, employeeType: 'professional', salonSettings })
        : current.accessEmail
    }))
  }

  function toggleFunction(option) {
    const nextFunctions = selectedFunctions.includes(option)
      ? selectedFunctions.filter((item) => item !== option)
      : [...selectedFunctions, option]
    setSelectedFunctions(nextFunctions)
    setForm((current) => ({ ...current, role: nextFunctions.join(', ') }))
  }

  function generateLogin() {
    setForm((current) => ({
      ...current,
      accessEmail: getSuggestedAccessEmail({ name: current.name, employeeType: 'professional', salonSettings }),
      temporaryPassword: current.temporaryPassword || String(Math.floor(100000 + Math.random() * 900000)),
      loginActive: true
    }))
  }

  return (
    <Modal title={employee ? 'Editar Funcionário' : 'Novo Funcionário'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, selectedFunctions }) }} className="space-y-3">
        <Field label="Nome" value={form.name} onChange={updateName} required />
        <Field label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required />
        <CheckboxGroup label="Função" options={employeeFunctionOptions} selected={selectedFunctions} onToggle={toggleFunction} />
        <section className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-bold">Login do Funcionário</h4>
              <p className="text-sm text-gray-500">Sugestão: {suggestedAccessEmail}</p>
            </div>
            <button type="button" onClick={generateLogin} className={buttonSecondary}>Usar sugestão</button>
          </div>
          <div className="mt-4">
            <Toggle label="Login do funcionário" checked={Boolean(form.loginActive)} onChange={(checked) => setForm({ ...form, loginActive: checked })} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="E-mail de acesso" value={form.accessEmail ?? ''} onChange={(value) => setForm({ ...form, accessEmail: value })} type="email" />
            <Field label="Senha" value={form.temporaryPassword ?? ''} onChange={(value) => setForm({ ...form, temporaryPassword: value })} />
          </div>
        </section>
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button><button className={buttonPrimary}>Salvar</button></div>
      </form>
    </Modal>
  )
}
function CashRegister({ entries, setEntries, closures, setClosures, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const todayEntries = entries.filter((item) => !(item.date ?? item.data) || (item.date ?? item.data) === todayIso)
  const incomeEntries = todayEntries.filter((item) => cashType(item) === 'entrada')
  const outcomeEntries = todayEntries.filter((item) => cashType(item) === 'saída' || cashType(item) === 'saida')
  const income = incomeEntries.reduce((sum, item) => sum + cashValue(item), 0)
  const outcome = outcomeEntries.reduce((sum, item) => sum + cashValue(item), 0)
  const commissionPaid = incomeEntries.reduce((sum, item) => sum + cashCommissionValue(item), 0)
  const salonProfit = incomeEntries.reduce((sum, item) => sum + cashSalonValue(item), 0)
  const byMethod = (method) => incomeEntries.filter((item) => cashMethod(item) === method).reduce((sum, item) => sum + cashValue(item), 0)
  const alreadyClosed = closures.some((item) => item.date === todayIso)

  function closeDay() {
    if (alreadyClosed && !window.confirm('O caixa de hoje já foi fechado. Registrar novo fechamento mesmo assim?')) return
    setClosures((current) => [...current, { id: Date.now(), date: todayIso, income, outcome, balance: income - outcome }])
    notify?.('Caixa do dia fechado com sucesso.')
  }

  function saveCashEntry(data) {
    const value = Number(data.value) || 0
    if (!data.description.trim() || value <= 0) {
      notify?.('Erro ao salvar: informe descrição e valor maior que zero.', 'error')
      return
    }
    setEntries((current) => [...current, {
      id: Date.now(),
      type: data.type,
      tipo: data.type.toLowerCase(),
      description: data.description.trim(),
      descricao: data.description.trim(),
      category: data.category.trim() || 'Operacional',
      categoria: data.category.trim() || 'Operacional',
      method: data.method,
      forma_pagamento: data.method,
      value,
      valor: value,
      date: data.date
    }])
    setModalOpen(false)
    notify?.('Movimentação salva com sucesso.')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Total do dia" value={money.format(income)} detail="Entradas" />
        <Metric title="Comissão paga" value={money.format(commissionPaid)} detail="Atendimentos" />
        <Metric title="Lucro do salão" value={money.format(salonProfit)} detail="Entradas - comissões" />
        <Metric title="Pix" value={money.format(byMethod('Pix'))} detail="Recebido hoje" />
        <Metric title="Dinheiro" value={money.format(byMethod('Dinheiro'))} detail="Recebido hoje" />
        <Metric title="Cartão" value={money.format(byMethod('Cartão'))} detail="Recebido hoje" />
        <Metric title="Pendente" value={money.format(byMethod('Pendente'))} detail="A receber" />
        <Metric title="Saídas" value={money.format(outcome)} detail="Hoje" />
        <Metric title="Saldo final" value={money.format(income - outcome)} detail="Entradas - saídas" />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => setModalOpen(true)} className="focus-ring whitespace-nowrap rounded-2xl border border-blush px-4 py-3 text-sm font-bold hover:bg-pearl">Nova movimentação</button>
        <button onClick={closeDay} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>Fechar caixa do dia</button>
      </div>
      <Panel title="Movimentações do caixa">
        <Table
          rows={todayEntries}
          columns={['date', 'client', 'service', 'employee', 'value', 'commission', 'salon']}
          labels={['Data', 'Cliente', 'Serviço', 'Profissional', 'Valor total', 'Comissão', 'Salão']}
          formatValue={(key, value, row) => {
            if (key === 'date') return formatDate(row.date ?? row.data ?? todayIso)
            if (key === 'client') return cashClientName(row) || cashDescription(row) || '-'
            if (key === 'service') return cashServiceName(row) || cashCategory(row) || '-'
            if (key === 'employee') return cashEmployeeName(row) || '-'
            if (key === 'value') return money.format(cashValue(row))
            if (key === 'commission') return isAppointmentCashEntry(row) ? money.format(cashCommissionValue(row)) : '-'
            if (key === 'salon') return isAppointmentCashEntry(row) ? money.format(cashSalonValue(row)) : '-'
            return value
          }}
        />
      </Panel>
      <Panel title="Fechamentos registrados">
        <CompactList items={closures.length ? closures.map((item) => `${formatDate(item.date)} · saldo ${money.format(item.balance)}`) : ['Nenhum fechamento registrado']} />
      </Panel>
      {modalOpen && <CashEntryModal onClose={() => setModalOpen(false)} onSave={saveCashEntry} />}
    </div>
  )
}

function CashEntryModal({ onClose, onSave }) {
  const [form, setForm] = useState({ type: 'Entrada', description: '', category: 'Operacional', method: 'Pix', value: 0, date: todayIso })
  return (
    <Modal title="Nova movimentação" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Select label="Tipo" value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={['Entrada', 'Saída']} />
        <Field label="Descrição" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
        <Field label="Categoria" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Forma de pagamento" value={form.method} onChange={(value) => setForm({ ...form, method: value })} options={['Pix', 'Dinheiro', 'Cartão', 'Pendente']} />
          <Field label="Valor" type="number" min="0.01" value={form.value} onChange={(value) => setForm({ ...form, value })} required />
        </div>
        <Field label="Data" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} required />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button className={buttonPrimary}>Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function Advances({ user, employees, advances, setAdvances, setCashEntries, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filters, setFilters] = useState({ employee: 'all', date: '', status: 'all' })
  const canAccess = user.role === 'admin' || user.role === 'cashier'
  const canDelete = user.role === 'admin'

  if (!canAccess) return <AccessDenied />

  const filteredAdvances = advances.filter((item) => (
    (filters.employee === 'all' || item.employee === filters.employee) &&
    (!filters.date || item.date === filters.date) &&
    (filters.status === 'all' || item.status === filters.status)
  ))

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setModalOpen(true)
  }

  function saveAdvance(data) {
    const payload = { ...data, value: Number(data.value) || 0 }
    if (!payload.employee || payload.value <= 0 || !payload.date || !payload.reason.trim()) {
      notify?.('Erro ao salvar: confira Funcionário, valor, data e motivo.', 'error')
      return
    }
    if (editing) {
      const updatedAdvance = { ...editing, ...payload }
      setAdvances((current) => current.map((item) => item.id === editing.id ? updatedAdvance : item))
      setCashEntries((current) => {
        const exists = current.some((entry) => entry.referenciaTipo === 'vale' && entry.referenciaId === editing.id)
        if (!exists) return [...current, createAdvanceCashEntry(updatedAdvance)]
        return current.map((entry) => (
          entry.referenciaTipo === 'vale' && entry.referenciaId === editing.id
            ? { ...entry, ...createAdvanceCashEntry(updatedAdvance), id: entry.id }
            : entry
        ))
      })
      notify?.('Vale atualizado.')
    } else {
      const newAdvance = { ...payload, id: Date.now() }
      setAdvances((current) => [...current, newAdvance])
      setCashEntries((current) => [...current, createAdvanceCashEntry(newAdvance)])
      notify?.('Vale criado e lançado no caixa.')
    }
    setModalOpen(false)
  }

  function markDiscounted(item) {
    setAdvances((current) => current.map((advance) => advance.id === item.id ? { ...advance, status: 'Descontado' } : advance))
    notify?.('Vale marcado como descontado.')
  }

  function removeAdvance(item) {
    if (!window.confirm(`Excluir o vale de ${item.employee}?`)) return
    setAdvances((current) => current.filter((advance) => advance.id !== item.id))
    setCashEntries((current) => current.filter((entry) => !(entry.referenciaTipo === 'vale' && entry.referenciaId === item.id)))
    notify?.('Vale excluído.')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Vales</h3>
          <p className="text-sm text-gray-500">Admin e Funcionário Caixa gerenciam todos os vales.</p>
        </div>
        <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>Novo Vale</button>
      </div>

      <Panel title="Filtros">
        <div className="grid gap-3 md:grid-cols-3">
          <Select label="Funcionário" value={filters.employee} onChange={(value) => setFilters({ ...filters, employee: value })} options={['Todos', ...employees.map((item) => item.name)]} values={['all', ...employees.map((item) => item.name)]} />
          <Field label="Data" type="date" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} />
          <Select label="Status" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={['Todos', 'Aberto', 'Descontado']} values={['all', 'Aberto', 'Descontado']} />
        </div>
      </Panel>

      <CardsGrid items={filteredAdvances} render={(item) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{item.employee}</p>
              <p className="mt-1 text-sm text-gray-500">{formatDate(item.date)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === 'Descontado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.status}</span>
          </div>
          <p className="mt-4 text-2xl font-bold">{money.format(item.value)}</p>
          <p className="mt-2 text-sm text-gray-600">Motivo: {item.reason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => openEdit(item)} className={buttonSecondary}>Editar</button>
            {item.status !== 'Descontado' && <button onClick={() => markDiscounted(item)} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Marcar descontado</button>}
            {canDelete && <button onClick={() => removeAdvance(item)} className={buttonDanger}>Excluir</button>}
          </div>
        </>
      )} />

      {filteredAdvances.length === 0 && (
        <Panel title="Resultado">
          <p className="text-sm font-semibold text-gray-500">Nenhum vale encontrado para os filtros selecionados.</p>
        </Panel>
      )}

      {modalOpen && <AdvanceModal employees={employees} advance={editing} onClose={() => setModalOpen(false)} onSave={saveAdvance} />}
    </div>
  )
}

function AdvanceModal({ employees, advance, onClose, onSave }) {
  const [form, setForm] = useState(advance ? {
    employee: advance.employee,
    value: advance.value,
    date: advance.date,
    status: advance.status,
    reason: advance.reason
  } : { employee: employees[0]?.name ?? '', value: 0, date: todayIso, status: 'Aberto', reason: '' })

  return (
    <Modal title={advance ? 'Editar vale' : 'Novo vale'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Select label="Funcionário" value={form.employee} onChange={(value) => setForm({ ...form, employee: value })} options={employees.map((item) => item.name)} />
        <Field label="Valor" type="number" min="0.01" value={form.value} onChange={(value) => setForm({ ...form, value })} required />
        <Field label="Data" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} required />
        <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={['Aberto', 'Descontado']} />
        <Field label="Motivo" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} required />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button className={buttonPrimary}>Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function AccessDenied() {
  return (
    <Panel title="Acesso bloqueado">
      <p className="text-sm font-semibold text-gray-500">Esta área está disponível apenas para Admin e Funcionário Caixa.</p>
    </Panel>
  )
}

function DataLoading() {
  return (
    <Panel title="Carregando dados">
      <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Buscando informações do salão...</p>
    </Panel>
  )
}

function Inventory({ user, items, setItems, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const canManage = user.role === 'admin'

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setModalOpen(true)
  }

  function saveProduct(data) {
    const payload = {
      ...data,
      name: data.name.trim(),
      product: data.name.trim(),
      quantity: Number(data.quantity) || 0,
      cost: Number(data.cost) || 0,
      min: Number(data.min) || 0
    }
    if (!payload.name || !payload.category || payload.quantity < 0 || payload.cost < 0) {
      notify?.('Erro ao salvar: confira nome, categoria e valores do produto.', 'error')
      return
    }

    if (editing) {
      setItems((current) => current.map((item) => item.id === editing.id ? { ...item, ...payload } : item))
    } else {
      setItems((current) => [...current, { ...payload, id: Date.now() }])
    }
    setModalOpen(false)
    notify?.('Produto salvo.')
  }

  function removeProduct(item) {
    if (!window.confirm(`Remover o produto "${item.name}" do estoque?`)) return
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))
    notify?.('Produto removido.')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Estoque</h3>
          <p className="text-sm text-gray-500">{canManage ? 'Cadastre, edite e acompanhe produtos do Salão.' : 'Visualização dos produtos e alertas de estoque.'}</p>
        </div>
        {canManage && <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>Novo Produto</button>}
      </div>

      <CardsGrid items={items} render={(item) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{item.name}</p>
              <p className="mt-1 text-sm text-gray-500">{item.category} · {item.unit}</p>
            </div>
            {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="h-14 w-14 rounded-xl border border-gray-100 object-cover" />}
            {item.quantity <= item.min && <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">Estoque baixo</span>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-pearl px-4 py-3">
              <p className="text-gray-500">Quantidade</p>
              <p className="font-bold">{item.quantity} {item.unit}</p>
            </div>
            <div className="rounded-2xl bg-pearl px-4 py-3">
              <p className="text-gray-500">Mínimo</p>
              <p className="font-bold">{item.min} {item.unit}</p>
            </div>
          </div>
          <p className="mt-3 text-sm">Custo unitário: <strong>{money.format(item.cost)}</strong></p>
          <p className="mt-2 text-sm text-gray-500">Fornecedor: {item.supplier}</p>
          {item.notes && <p className="mt-2 text-sm text-gray-600">Obs.: {item.notes}</p>}
          {canManage && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => openEdit(item)} className={buttonSecondary}>Editar</button>
              <button onClick={() => removeProduct(item)} className={buttonDanger}>Remover</button>
            </div>
          )}
        </>
      )} />

      {modalOpen && <InventoryModal product={editing} onClose={() => setModalOpen(false)} onSave={saveProduct} />}
    </div>
  )
}

function InventoryModal({ product, onClose, onSave }) {
  const units = ['unidade', 'ml', 'litro', 'grama', 'kg', 'caixa']
  const [form, setForm] = useState(product ? {
    name: product.name,
    category: product.category,
    quantity: product.quantity,
    unit: product.unit,
    cost: product.cost,
    supplier: product.supplier,
    min: product.min,
    imageUrl: product.imageUrl ?? '',
    notes: product.notes ?? ''
  } : { name: '', category: '', quantity: 0, unit: 'unidade', cost: 0, supplier: '', min: 0, imageUrl: '', notes: '' })

  function handleImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((current) => ({ ...current, imageUrl: String(reader.result ?? '') }))
    reader.readAsDataURL(file)
  }

  return (
    <Modal title={product ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Field label="Nome do produto" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Field label="Categoria" value={form.category} onChange={(value) => setForm({ ...form, category: value })} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantidade atual" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
          <Select label="Unidade" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} options={units} />
          <Field label="Custo unitário" type="number" value={form.cost} onChange={(value) => setForm({ ...form, cost: value })} />
          <Field label="Estoque mínimo" type="number" value={form.min} onChange={(value) => setForm({ ...form, min: value })} />
        </div>
        <Field label="Fornecedor" value={form.supplier} onChange={(value) => setForm({ ...form, supplier: value })} />
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-600">Imagem do produto</span>
          <input type="file" accept="image/*" onChange={handleImage} className={inputBase} />
        </label>
        {form.imageUrl && <img src={form.imageUrl} alt="Prévia do produto" className="h-28 w-28 rounded-2xl border border-gray-200 object-cover" />}
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-600">Observações</span>
          <textarea className={`${inputBase} min-h-24`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button className={buttonPrimary}>Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function Reports({ appointments, employees, cashEntries = [], user }) {
  const appointmentEntries = cashEntries.filter(isAppointmentCashEntry)
  const completed = appointmentEntries.length ? appointmentEntries : appointments.filter((item) => isCompletedStatus(item.status))
  const commissions = appointmentEntries.length
    ? appointmentEntries.reduce((sum, item) => sum + cashCommissionValue(item), 0)
    : completed.reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0)
  const employeeCommissions = appointmentEntries.length
    ? Object.values(appointmentEntries.reduce((acc, item) => {
      const key = String(field(item, 'employeeId', 'employee_id') ?? cashEmployeeName(item) ?? '')
      if (!key) return acc
      const employee = employees.find((current) => String(current.id) === key || current.name === cashEmployeeName(item))
      acc[key] = acc[key] ?? { name: employee?.name ?? cashEmployeeName(item), value: 0, count: 0 }
      acc[key].value += cashCommissionValue(item)
      acc[key].count += 1
      return acc
    }, {})).filter((item) => item.count > 0)
    : getProfessionals(employees)
      .map((employee) => ({
        name: employee.name,
        value: completed.filter((item) => isAppointmentForEmployee(item, employee)).reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0),
        count: completed.filter((item) => isAppointmentForEmployee(item, employee)).length
      }))
      .filter((item) => item.count > 0)
  const serviceCommissions = appointmentEntries.length
    ? topEntries(appointmentEntries.reduce((acc, item) => ({ ...acc, [cashServiceName(item) || 'Serviço']: (acc[cashServiceName(item) || 'Serviço'] || 0) + cashCommissionValue(item) }), {}), 8)
    : topEntries(completed.reduce((acc, item) => ({ ...acc, [item.service]: (acc[item.service] || 0) + getAppointmentCommission(item, employees) }), {}), 8)
  const serviceSales = appointmentEntries.length
    ? topEntries(countBy(appointmentEntries, (item) => cashServiceName(item) || 'Serviço'))
    : topEntries(countBy(completed, (item) => item.service))
  const revenue = appointmentEntries.length
    ? appointmentEntries.reduce((sum, item) => sum + cashValue(item), 0)
    : completed.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {user.role === 'admin' && <Panel title="Faturamento por período"><CompactList items={[`Mês atual: ${money.format(revenue)}`, `Ticket médio: ${money.format(completed.length ? revenue / completed.length : 0)}`]} /></Panel>}
      <Panel title={user.role === 'admin' ? 'Comissões gerais' : 'Minha Comissão'}><CompactList items={[money.format(commissions)]} /></Panel>
      <Panel title="Comissão por funcionário"><CompactList items={employeeCommissions.length ? employeeCommissions.map((item) => `${item.name}: ${money.format(item.value)}`) : ['Sem comissões calculadas']} /></Panel>
      <Panel title="Comissão por serviço"><CompactList items={serviceCommissions.length ? serviceCommissions.map(([label, value]) => `${label}: ${money.format(value)}`) : ['Sem comissões calculadas']} /></Panel>
      <Panel title="Serviços mais vendidos"><CompactList items={serviceSales.length ? serviceSales.map(([label, count]) => `${label}: ${count}`) : ['Sem dados']} /></Panel>
      <Panel title="Clientes mais frequentes"><CompactList items={['Juliana Nunes', 'Ana Paula Martins', 'Patricia Souza']} /></Panel>
      {user.role === 'admin' && <Panel title="Pagamentos pendentes"><CompactList items={['Juliana Nunes: R$ 70,00', 'Carla Mendes: R$ 220,00']} /></Panel>}
    </div>
  )
}

function ProfessionalAgenda({ user, appointments, employees, blockedSlots, salonSettings, notify }) {
  const employee = employees.find((item) => item.id === user.employeeId && isProfessional(item))
  const employeeServices = toList(employee?.services || '')
  const [date, setDate] = useState(todayIso)
  const [view, setView] = useState('day')
  const [serviceName, setServiceName] = useState(employeeServices[0] ?? services[0]?.name ?? '')
  const [selectedSlot, setSelectedSlot] = useState(null)

  if (!employee) return <AccessDenied />

  const selectedService = services.find((item) => item.name === serviceName)
  const weekDates = getWeekDates(date)
  const dayAppointments = appointments.filter((item) => item.date === date)
  const weekAppointments = appointments.filter((item) => weekDates.includes(item.date))
  const availableSlots = getAvailableSlots({ employee, date, service: selectedService, appointments, blockedSlots, salonSettings })
  const occupiedSlots = getOccupiedSlots({ employee, date, appointments })
  const serviceOptions = employeeServices.length ? employeeServices : services.filter((item) => item.responsible === employee.name).map((item) => item.name)

  function requestSlot(data) {
    if (!data.client.trim() || !data.service.trim()) {
      notify?.('Erro ao solicitar: informe cliente e serviço.', 'error')
      return
    }
    const phone = normalizePhone(salonSettings.receptionWhatsapp)
    if (!phone) {
      notify?.('Cadastre o WhatsApp da recepção nas configurações do Salão.', 'error')
      return
    }
    const message = [
      'Olá, gostaria de marcar uma cliente.',
      '',
      `Profissional: ${employee.name}`,
      `Cliente: ${data.client}`,
      `Serviço: ${data.service}`,
      `Data: ${formatDate(date)}`,
      `Horário: ${selectedSlot}`,
      data.phone ? `Telefone: ${data.phone}` : '',
      data.notes ? `Observação: ${data.notes}` : ''
    ].filter(Boolean).join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
    setSelectedSlot(null)
    notify?.('Solicitação enviada para a recepção.')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Minha agenda" value={formatDate(date)} detail={employee.name} />
        <Metric title="Horários livres" value={availableSlots.length} detail={selectedService?.name ?? 'Serviço'} />
        <Metric title="Agendamentos do dia" value={dayAppointments.length} detail="Somente meus atendimentos" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Panel title="Meus Horários disponíveis">
          <div className="space-y-4">
            <DatePickerBar value={date} onChange={setDate} />
            <Select label="Serviço desejado" value={serviceName} onChange={setServiceName} options={serviceOptions.length ? serviceOptions : services.map((item) => item.name)} />
            <div className="inline-flex rounded-2xl border border-blush bg-pearl p-1 text-sm font-bold dark:border-white/10 dark:bg-white/5">
              <button type="button" onClick={() => setView('day')} className={`rounded-xl px-5 py-2 transition ${view === 'day' ? 'bg-graphite text-white shadow-sm dark:bg-lilacSoft dark:text-graphite' : 'hover:bg-white dark:hover:bg-white/10'}`}>Dia</button>
              <button type="button" onClick={() => setView('week')} className={`rounded-xl px-5 py-2 transition ${view === 'week' ? 'bg-graphite text-white shadow-sm dark:bg-lilacSoft dark:text-graphite' : 'hover:bg-white dark:hover:bg-white/10'}`}>Semana</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableSlots.map((slot) => (
                <button key={slot} type="button" onClick={() => setSelectedSlot(slot)} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
                  {slot} · Solicitar agendamento
                </button>
              ))}
              {availableSlots.length === 0 && <p className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm font-semibold text-gray-600">Sem Horários disponíveis nesta data.</p>}
            </div>
          </div>
        </Panel>

        <Panel title={view === 'day' ? 'Meus agendamentos do dia' : 'Minha semana'}>
          {view === 'day' ? (
            <div className="space-y-3">
              {dayAppointments.map((item) => <LineItem key={item.id} label={`${item.time} · ${item.client} · ${item.service}`} value={formatAppointmentStatus(item.status)} />)}
              {dayAppointments.length === 0 && <p className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm font-semibold text-gray-600">Nenhum agendamento nesta data.</p>}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {weekDates.map((weekDate) => {
                const dayItems = weekAppointments.filter((item) => item.date === weekDate)
                return (
                  <div key={weekDate} className="rounded-2xl border border-gray-100 bg-pearl p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="font-bold capitalize">{formatDate(weekDate)}</p>
                    <div className="mt-3 space-y-2">
                      {dayItems.map((item) => <p key={item.id} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold dark:bg-[#17141c]">{item.time} · {item.client}</p>)}
                      {dayItems.length === 0 && <p className="text-sm font-semibold text-gray-500">Sem agendamentos.</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <AvailabilityPanel employee={employee} date={date} service={selectedService} salonSettings={salonSettings} availableSlots={availableSlots} occupiedSlots={occupiedSlots} />
      {selectedSlot && <ScheduleRequestModal employee={employee} slot={selectedSlot} date={date} serviceName={serviceName} onClose={() => setSelectedSlot(null)} onSubmit={requestSlot} />}
    </div>
  )
}

function ScheduleRequestModal({ employee, slot, date, serviceName, onClose, onSubmit }) {
  const [form, setForm] = useState({ client: '', phone: '', service: serviceName, notes: '' })
  const employeeServices = toList(employee.services || '')

  return (
    <Modal title="Solicitar agendamento" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(form) }} className="space-y-3">
        <div className="rounded-2xl border border-blush bg-pearl px-4 py-3 text-sm font-semibold text-gray-700">
          {employee.name} · {formatDate(date)} · {slot}
        </div>
        <Field label="Nome da cliente" value={form.client} onChange={(value) => setForm({ ...form, client: value })} required />
        <Field label="Telefone da cliente (opcional)" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <Select label="Serviço desejado" value={form.service} onChange={(value) => setForm({ ...form, service: value })} options={employeeServices.length ? employeeServices : services.map((item) => item.name)} />
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-600">Observação (opcional)</span>
          <textarea className={`${inputBase} min-h-24`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button className={buttonPrimary}>Enviar pelo WhatsApp</button>
        </div>
      </form>
    </Modal>
  )
}

function MyAppointments({ user, appointments }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Atendimentos hoje" value={appointments.length} detail={user.name} />
        <Metric title="Concluídos" value={appointments.filter((item) => isCompletedStatus(item.status)).length} detail="Sem valores financeiros" />
        <Metric title="Confirmados" value={appointments.filter((item) => normalizeAppointmentStatus(item.status) === 'confirmado').length} detail="Próximos Horários" />
        <Metric title="Minha Comissão" value={money.format(appointments.filter((item) => isCompletedStatus(item.status)).reduce((sum, item) => sum + Number(item.comissaoCalculada ?? item.commission ?? 0), 0))} detail="Atendimentos concluídos" />
      </div>
      <Panel title="Meus atendimentos">
        <div className="space-y-3">
          {appointments.map((item) => <LineItem key={item.id} label={`${formatDate(item.date)} · ${item.time} · ${item.client}`} value={formatAppointmentStatus(item.status)} />)}
        </div>
      </Panel>
    </div>
  )
}

function EmployeeProfile({ user, appointments, employees, setEmployees }) {
  const employee = employees.find((item) => item.name === user.name)
  const currentStatus = employee?.workStatus ?? 'Ativo'

  function updateMyStatus(status) {
    setEmployees((current) => current.map((item) => item.name === user.name ? { ...item, workStatus: status } : item))
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.7fr_1fr]">
      <Panel title="Perfil">
        <p className="text-2xl font-bold">{user.name}</p>
        <p className="mt-2 text-gray-600">{user.title}</p>
        <p className="mt-4 text-sm">E-mail: {user.email}</p>
        <p className="mt-2 text-sm">Telefone: {user.phone}</p>
        <div className="mt-5">
          <Select label="Meu status" value={currentStatus} onChange={updateMyStatus} options={employeeStatuses} />
        </div>
      </Panel>
      <Panel title="Rotina de hoje">
        <CompactList items={appointments.map((item) => `${formatDate(item.date)} · ${item.time} · ${item.client} · ${item.service}`)} />
      </Panel>
    </div>
  )
}

function Settings({ salonId, settings, setSettings, notify }) {
  const [form, setForm] = useState({
    salonName: settings.salonName ?? '',
    receptionWhatsapp: settings.receptionWhatsapp ?? '',
    workingDays: normalizeWorkingDays(settings.workingDays),
    openingHours: normalizeOpeningHours(settings.openingHours)
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      salonName: settings.salonName ?? '',
      receptionWhatsapp: settings.receptionWhatsapp ?? '',
      workingDays: normalizeWorkingDays(settings.workingDays),
      openingHours: normalizeOpeningHours(settings.openingHours)
    })
  }, [settings.salonName, settings.receptionWhatsapp, settings.workingDays, settings.openingHours])

  function setQuickDays(days) {
    setForm((current) => ({ ...current, workingDays: days }))
  }

  function toggleDay(dayId) {
    setForm((current) => {
      const active = current.workingDays.includes(dayId)
      return {
        ...current,
        workingDays: active ? current.workingDays.filter((item) => item !== dayId) : [...current.workingDays, dayId]
      }
    })
  }

  function updateDayHours(dayId, key, value) {
    setForm((current) => ({
      ...current,
      openingHours: {
        ...current.openingHours,
        [dayId]: {
          ...(current.openingHours[dayId] ?? defaultOpeningHours[dayId]),
          [key]: value
        }
      }
    }))
  }

  async function saveSalonSettings(event) {
    event.preventDefault()

    const invalidDay = form.workingDays.find((dayId) => {
      const hours = form.openingHours[dayId]
      return !hours?.open || !hours?.close || timeToMinutes(hours.close) <= timeToMinutes(hours.open)
    })

    if (invalidDay) {
      notify?.('Confira abertura e fechamento dos dias ativos.', 'error')
      return
    }

    const payload = {
      salonName: form.salonName.trim(),
      receptionWhatsapp: form.receptionWhatsapp.trim(),
      workingDays: form.workingDays,
      openingHours: form.openingHours
    }

    setSaving(true)
    try {
      const saved = normalizeSalonSettings(await updateSalonRecord(salonId, payload))
      setSettings((current) => ({ ...current, ...saved }))
      notify?.('Salvo com sucesso')
    } catch (error) {
      handleDataActionError(error, notify)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <form onSubmit={saveSalonSettings} className="space-y-6 rounded-2xl border border-blush bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1c1922] sm:p-8">
        <div>
          <h3 className="text-xl font-bold">Dados do Salão</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Edite as informações básicas usadas na identificação do sistema.</p>
        </div>

        <div className="space-y-4">
          <Field label="Nome do salão" value={form.salonName} onChange={(value) => setForm((current) => ({ ...current, salonName: value }))} placeholder="Ex.: Salão Belas" />
          <Field label="WhatsApp da recepção/caixa" value={form.receptionWhatsapp} onChange={(value) => setForm((current) => ({ ...current, receptionWhatsapp: value }))} placeholder="Ex.: 5511999999999" />
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-base font-bold text-graphite dark:text-gray-100">Horário de funcionamento</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Dias desmarcados não aparecem como disponíveis na agenda.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setQuickDays(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])} className={buttonSecondary}>Segunda a sexta</button>
              <button type="button" onClick={() => setQuickDays(['tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])} className={buttonSecondary}>Terça a sábado</button>
              <button type="button" onClick={() => setQuickDays(defaultWorkingDays)} className={buttonSecondary}>Todos os dias</button>
            </div>
          </div>

          <div className="space-y-3">
            {weekDayOptions.map((day) => {
              const active = form.workingDays.includes(day.id)
              const hours = form.openingHours[day.id] ?? defaultOpeningHours[day.id]
              return (
                <div key={day.id} className="grid gap-3 rounded-2xl border border-gray-100 bg-pearl p-4 dark:border-white/10 dark:bg-white/5 sm:grid-cols-[1fr_150px_150px] sm:items-end">
                  <Toggle label={day.label} checked={active} onChange={() => toggleDay(day.id)} />
                  <Field label="Abertura" type="time" value={hours.open} onChange={(value) => updateDayHours(day.id, 'open', value)} disabled={!active} />
                  <Field label="Fechamento" type="time" value={hours.close} onChange={(value) => updateDayHours(day.id, 'close', value)} disabled={!active} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={`${buttonPrimary} rounded-2xl px-5 py-3`}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Modal({ title, children, onClose }) {
  const modalRef = useRef(null)

  useEffect(() => {
    const firstField = modalRef.current?.querySelector('input, select, textarea')
    firstField?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-graphite/35 px-4 py-6">
      <div ref={modalRef} className="simple-scrollbar max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-blush bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className={`${buttonSecondary} px-3 py-2`}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(onClose, 3200)
    return () => window.clearTimeout(timer)
  }, [toast, onClose])

  if (!toast) return null

  return (
    <div className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border px-5 py-4 text-sm font-bold shadow-soft ${
      toast.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
    }`}>
      {toast.text}
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-graphite dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100">
      <span className="min-w-0 break-words">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#c9a85d]" />
    </label>
  )
}
function Metric({ title, value, detail }) {
  return (
    <div className={`${cardBase} min-h-[132px]`}>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-bold text-graphite dark:text-gray-100">{value}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className={panelBase}>
      <h3 className="mb-4 text-lg font-bold text-graphite dark:text-gray-100">{title}</h3>
      {children}
    </section>
  )
}

function Select({ label, value, onChange, options, values, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">{label}</span>
      <select disabled={disabled} className={inputBase} value={value} onChange={(event) => onChange(event.target.value)}>
        {(options || []).map((option, index) => <option key={values?.[index] ?? option} value={values?.[index] ?? option}>{option}</option>)}
      </select>
    </label>
  )
}

function CheckboxGroup({ label, options, selected, onToggle }) {
  return (
    <fieldset className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <legend className="px-1 text-sm font-semibold text-gray-600 dark:text-gray-300">{label}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(options || []).map((option) => (
          <label key={option} className="flex min-w-0 items-start gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-semibold text-graphite dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100">
            <input
              type="checkbox"
              checked={(selected || []).includes(option)}
              onChange={() => onToggle(option)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#c9a85d]"
            />
            <span className="min-w-0 break-words">{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function CardsGrid({ items, render }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(items || []).map((item) => (
        <article key={item.id} className={`${cardBase} min-h-[180px]`}>
          {render(item)}
        </article>
      ))}
    </div>
  )
}

function CompactList({ items }) {
  return (
    <div className="space-y-3">
      {(items || []).map((item) => (
        <div key={item} className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
          {item}
        </div>
      ))}
    </div>
  )
}

function LineItem({ label, value, positive, negative }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
      <span className="font-semibold text-gray-700 dark:text-gray-200">{label}</span>
      <span className={`font-bold ${positive ? 'text-emerald-700 dark:text-emerald-300' : negative ? 'text-rose-700 dark:text-rose-300' : 'text-graphite dark:text-gray-100'}`}>{value}</span>
    </div>
  )
}

function Table({ rows, columns, labels, formatValue }) {
  return (
    <div className="simple-scrollbar overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-gray-500 dark:border-white/10 dark:text-gray-400">
            {labels.map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 dark:border-white/5">
              {columns.map((column) => <td key={column} className="px-3 py-3 font-medium text-gray-700 dark:text-gray-200">{formatValue(column, row[column], row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default App
