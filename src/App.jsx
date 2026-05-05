import { Component, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'
import { uiText } from './lib/uiText'
import {
  createAppointment as createAppointmentRecord,
  createAuditLog as createAuditLogRecord,
  createCashClosure as createCashClosureRecord,
  createCashMovement as createCashMovementRecord,
  createCommissionPayment as createCommissionPaymentRecord,
  createAdvance as createAdvanceRecord,
  createClient as createClientRecord,
  createEmployee as createEmployeeRecord,
  createService as createServiceRecord,
  databaseNotConfiguredMessage,
  deleteAppointment as deleteAppointmentRecord,
  deleteEmployee as deleteEmployeeRecord,
  deleteService as deleteServiceRecord,
  ensureAdminSalon,
  fetchAdvances as fetchAdvancesFromSupabase,
  fetchAuditLogs as fetchAuditLogsFromSupabase,
  fetchAppointments as fetchAppointmentsFromSupabase,
  fetchCashClosures as fetchCashClosuresFromSupabase,
  fetchCashMovements as fetchCashMovementsFromSupabase,
  fetchCashMovementByAppointment as fetchCashMovementByAppointmentFromSupabase,
  fetchClients as fetchClientsFromSupabase,
  fetchCommissionPayments as fetchCommissionPaymentsFromSupabase,
  fetchEmployees as fetchEmployeesFromSupabase,
  fetchSalon,
  fetchServices as fetchServicesFromSupabase,
  fetchStockItems as fetchStockItemsFromSupabase,
  isMissingTableError,
  seedSalonData,
  updateAppointment as updateAppointmentRecord,
  updateAdvance as updateAdvanceRecord,
  updateCashMovement as updateCashMovementRecord,
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
const appointmentCardBase = 'min-w-0 overflow-visible rounded-2xl border p-4 shadow-soft transition'
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
const paymentMethodOptions = ['Dinheiro', 'PIX', 'Cartão', 'Débito', 'Crédito', 'Pendente / pagar depois']
const paymentMethodValues = ['dinheiro', 'pix', 'cartao', 'debito', 'credito', 'pendente']
const appointmentPaymentOptions = ['Sem pagamento', 'PIX', 'Dinheiro', 'Débito', 'Crédito']
const appointmentPaymentValues = ['', 'pix', 'dinheiro', 'debito', 'credito']

function normalizeAppointmentPaymentMethod(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized === 'dinheiro' || normalized === 'pix' || normalized === 'debito' || normalized === 'credito' || normalized === 'pendente') return normalized
  if (normalized === 'cartao') return 'credito'
  return null
}

function cashPaymentMethodLabel(value) {
  const labels = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito', pendente: 'Pendente' }
  return labels[normalizeAppointmentPaymentMethod(value)] ?? 'Pendente'
}

function paymentMethodLabel(value) {
  const labels = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', pendente: 'Pendente' }
  return labels[normalizeAppointmentPaymentMethod(value)] ?? 'Pendente'
}

function financialPaymentMethodLabel(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (normalized === 'transferencia') return 'Transferência'
  return paymentMethodLabel(value)
}

function normalizePaymentStatus(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized === 'cancelado' || normalized === 'cancelada') return 'cancelado'
  return normalized === 'pago' || normalized === 'concluido' ? 'pago' : 'pendente'
}

function isPaymentPaid(value) {
  return normalizePaymentStatus(value) === 'pago'
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

function addMonthsIso(date, months) {
  if (!date) return getTodayIso()
  const [year, month, day] = date.split('-').map(Number)
  const nextDate = new Date(year, month - 1, day)
  nextDate.setMonth(nextDate.getMonth() + months)
  const nextYear = nextDate.getFullYear()
  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0')
  const nextDay = String(nextDate.getDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

function getPeriodEndDate(startDate, periodType) {
  if (periodType === 'quinzena') return shiftDate(startDate, 15)
  if (periodType === 'mes') return addMonthsIso(startDate, 1)
  return shiftDate(startDate, 7)
}

function parseDateStart(date) {
  const [year, month, day] = String(date ?? '').split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseDateEnd(date) {
  const parsed = parseDateStart(date)
  if (!parsed) return null
  parsed.setHours(23, 59, 59, 999)
  return parsed
}

function parseCashCreatedAt(entry) {
  const createdAt = field(entry, 'createdAt', 'created_at')
  if (!createdAt) return null
  const parsed = new Date(createdAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
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

function isEmployeeForUser(employee, user) {
  if (!employee || !user) return false
  return (user.employeeId && String(employee.id) === String(user.employeeId)) ||
    (employee.accessEmail && user.email && employee.accessEmail.toLowerCase() === user.email.toLowerCase()) ||
    employee.name === user.name
}

function toEmployeeType(value) {
  const normalized = String(value ?? 'professional')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (normalized === 'caixa' || normalized === 'cashier') return 'cashier'
  if (normalized === 'admin') return 'admin'
  return 'professional'
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
  return { ...appointment, commission: 0, comissaoCalculada: 0 }
}

function getClientInsights(clientName, appointments) {
  const visits = appointments.filter((item) => item.client === clientName && isCompletedStatus(item.status))
  const serviceCounts = visits.reduce((acc, item) => ({ ...acc, [item.service]: (acc[item.service] || 0) + 1 }), {})
  const favoriteService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sem histórico'
  const lastVisit = visits.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0]?.date
  return {
    favoriteService,
    lastVisit: lastVisit ? formatDate(lastVisit) : 'Sem visita concluída',
    visitCount: visits.length,
    averageTicket: 0
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
  return String(entry?.tipo ?? entry?.type ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function cashValue(entry) {
  return Number(field(entry, 'amount') ?? field(entry, 'serviceValue', 'service_value') ?? field(entry, 'value') ?? field(entry, 'valor') ?? 0)
}

function cashDiscount(entry) {
  return Number(field(entry, 'discount') ?? field(entry, 'desconto') ?? 0)
}

function cashDate(entry) {
  return field(entry, 'date', 'data') ?? todayIso
}

function cashServiceValue(entry) {
  return Number(field(entry, 'serviceValue', 'service_value') ?? field(entry, 'amount') ?? cashValue(entry))
}

function cashMethod(movimento) {
  if (!movimento) return null
  return normalizeAppointmentPaymentMethod(movimento?.payment_method ?? movimento?.paymentMethod ?? movimento?.method)
}

function cashDescription(entry) {
  return entry?.descricao ?? entry?.description ?? ''
}

function cashCategory(entry) {
  return entry?.categoria ?? entry?.category ?? ''
}

function cashStatus(entry) {
  return normalizePaymentStatus(field(entry, 'status') ?? field(entry, 'paymentStatus', 'payment_status') ?? 'pendente')
}

function cashCancelledAt(entry) {
  return field(entry, 'cancelledAt', 'cancelled_at')
}

function isActiveCashEntry(entry) {
  return cashStatus(entry) !== 'cancelado'
}

function isPaidIncomeCashEntry(entry) {
  return isActiveCashEntry(entry) && cashType(entry) === 'entrada' && cashStatus(entry) === 'pago'
}

function isPendingIncomeCashEntry(entry) {
  return isActiveCashEntry(entry) && cashType(entry) === 'entrada' && cashStatus(entry) === 'pendente'
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
  if (normalized === 'em_atendimento' || normalized === 'ematendimento' || normalized === 'em atendimento') return 'em_atendimento'
  if (normalized === 'aguardando_pagamento' || normalized === 'aguardandopagamento' || normalized === 'aguardando pagamento') return 'aguardando_pagamento'
  if (normalized === 'concluido' || normalized === 'finalizado') return 'concluido'
  if (normalized === 'cancelado') return 'cancelado'
  return 'agendado'
}

const appointmentStatusOptions = [
  { value: 'agendado', label: uiText.appointments.statusScheduled },
  { value: 'confirmado', label: uiText.appointments.statusConfirmed },
  { value: 'em_atendimento', label: uiText.appointments.statusInService },
  { value: 'aguardando_pagamento', label: uiText.appointments.statusWaitingPayment },
  { value: 'concluido', label: uiText.appointments.statusFinished },
  { value: 'cancelado', label: uiText.appointments.statusCanceled }
]

const appointmentStatusLabels = {
  agendado: uiText.appointments.statusScheduled,
  confirmado: uiText.appointments.statusConfirmed,
  em_atendimento: uiText.appointments.statusInService,
  aguardando_pagamento: uiText.appointments.statusWaitingPayment,
  concluido: uiText.appointments.statusFinished,
  cancelado: uiText.appointments.statusCanceled
}

function formatAppointmentStatus(status) {
  return appointmentStatusLabels[normalizeAppointmentStatus(status)] ?? 'Agendado'
}

function appointmentStatusTone(status) {
  const normalized = normalizeAppointmentStatus(status)
  if (normalized === 'concluido') return 'green'
  if (normalized === 'cancelado') return 'rose'
  if (normalized === 'em_atendimento') return 'cyan'
  if (normalized === 'aguardando_pagamento') return 'amber'
  return 'violet'
}

function cashAppointmentId(entry) {
  return field(entry, 'appointmentId', 'appointment_id')
}

function cashCommissionValue(entry) {
  return Number(field(entry, 'commissionValue', 'commission_value') ?? 0)
}

function cashCommissionPaid(entry) {
  return Boolean(field(entry, 'commissionPaid', 'commission_paid'))
}

function cashCommissionPaidAt(entry) {
  return field(entry, 'commissionPaidAt', 'commission_paid_at')
}

function cashCommissionPaymentMethod(entry) {
  return field(entry, 'commissionPaymentMethod', 'commission_payment_method') ?? ''
}

function cashCommissionNotes(entry) {
  return field(entry, 'commissionNotes', 'commission_notes') ?? ''
}

function cashSalonValue(entry) {
  return Number(field(entry, 'salonValue', 'salon_value') ?? (cashServiceValue(entry) - cashCommissionValue(entry)))
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

function normalizeAdvanceStatus(status) {
  const normalized = String(status ?? 'pendente')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized === 'descontado') return 'descontado'
  if (normalized === 'cancelado' || normalized === 'excluido') return 'cancelado'
  return 'pendente'
}

function advanceEmployeeId(advance) {
  return field(advance, 'employeeId', 'employee_id')
}

function advanceEmployeeName(advance) {
  return field(advance, 'employeeName', 'employee_name') ?? field(advance, 'employee') ?? ''
}

function advanceValue(advance) {
  return Number(field(advance, 'amount') ?? field(advance, 'value') ?? 0)
}

function advanceCreatedDate(advance) {
  return String(field(advance, 'createdAt', 'created_at') ?? todayIso).slice(0, 10)
}

function advanceStatus(advance) {
  if (advanceCancelledAt(advance)) return 'cancelado'
  return normalizeAdvanceStatus(field(advance, 'status'))
}

function advanceDiscountedDate(advance) {
  return String(field(advance, 'discountedAt', 'discounted_at') ?? '').slice(0, 10)
}

function advanceCancelledAt(advance) {
  return field(advance, 'cancelledAt', 'cancelled_at')
}

function isValidAdvance(advance) {
  return advanceStatus(advance) !== 'cancelado'
}

function isAdvanceForEmployee(advance, employeeId, employeeName) {
  return (employeeId && String(advanceEmployeeId(advance) ?? '') === String(employeeId)) ||
    (employeeName && advanceEmployeeName(advance) === employeeName)
}

function advanceInPeriod(advance, startDate, endDate) {
  const created = parseDateStart(advanceCreatedDate(advance))
  const start = parseDateStart(startDate)
  const end = parseDateEnd(endDate)
  return created && start && end && created >= start && created <= end
}

function advanceStatusLabel(advance) {
  const normalized = typeof advance === 'object' ? advanceStatus(advance) : normalizeAdvanceStatus(advance)
  if (normalized === 'descontado') return 'Descontado'
  if (normalized === 'cancelado') return 'Cancelado'
  return 'Pendente'
}

function advanceStatusTone(advance) {
  const normalized = typeof advance === 'object' ? advanceStatus(advance) : normalizeAdvanceStatus(advance)
  if (normalized === 'descontado') return 'green'
  if (normalized === 'cancelado') return 'rose'
  return 'amber'
}

function isAppointmentCashEntry(entry) {
  return cashType(entry) === 'entrada' && Boolean(cashAppointmentId(entry))
}

function createCompletedAppointmentCashEntry(appointment, employees = [], serviceItems = services) {
  const service = serviceItems.find((item) => String(item.id) === String(appointment.serviceId ?? appointment.service_id) || item.name === appointment.service)
  const employee = employees.find((item) => isAppointmentForEmployee(appointment, item))
  const originalServiceValue = Number(appointment.value ?? appointment.valor ?? service?.price ?? 0) || 0
  const discount = Math.min(Math.max(Number(appointment.discount ?? appointment.desconto ?? 0) || 0, 0), originalServiceValue)
  const serviceValue = Math.max(originalServiceValue - discount, 0)
  const commissionPercent = Number(service?.commission_percent ?? service?.commissionPercent ?? employee?.commission ?? employee?.commission_percent ?? 0) || 0
  const commissionValue = (serviceValue * commissionPercent) / 100
  const salonValue = serviceValue - commissionValue
  const paymentMethod = normalizeAppointmentPaymentMethod(appointment.paymentMethod ?? appointment.payment_method) ?? 'pendente'
  const paymentStatus = paymentMethod === 'pendente' ? 'pendente' : 'pago'
  const createdAt = new Date().toISOString()
  return {
    type: 'entrada',
    category: 'service',
    description: `Atendimento - ${appointment.client}`,
    notes: appointment.notes ?? appointment.observacao ?? '',
    paymentMethod,
    payment_method: paymentMethod,
    amount: serviceValue,
    date: appointment.date ?? todayIso,
    status: paymentStatus,
    clientName: appointment.client ?? '',
    client_name: appointment.client ?? '',
    serviceName: service?.name ?? appointment.service ?? '',
    service_name: service?.name ?? appointment.service ?? '',
    employeeName: employee?.name ?? getAppointmentEmployeeName(appointment) ?? '',
    employee_name: employee?.name ?? getAppointmentEmployeeName(appointment) ?? '',
    serviceValue,
    service_value: serviceValue,
    discount,
    desconto: discount,
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
    createdAt,
    created_at: createdAt
  }
}

function createAdvanceCashEntry(advance) {
  const employeeName = advanceEmployeeName(advance)
  const createdDate = advanceCreatedDate(advance)
  return {
    id: advance.id ? `advance-${advance.id}` : Date.now() + 1,
    type: 'saida',
    category: 'advance',
    description: `Vale - ${employeeName}`,
    amount: advanceValue(advance),
    date: createdDate,
    paymentMethod: 'dinheiro',
    payment_method: 'dinheiro',
    status: advanceStatus(advance) === 'cancelado' ? 'cancelado' : 'pago',
    employeeId: advanceEmployeeId(advance),
    employee_id: advanceEmployeeId(advance),
    employeeName,
    employee_name: employeeName
  }
}

function buildCashClosureSummary(entries = [], date = todayIso) {
  const dayEntries = entries.filter((item) => cashDate(item) === date && isActiveCashEntry(item))
  const incomeEntries = dayEntries.filter((item) => cashType(item) === 'entrada')
  const paidIncomeEntries = incomeEntries.filter(isPaidIncomeCashEntry)
  const pendingIncomeEntries = incomeEntries.filter(isPendingIncomeCashEntry)
  const outcomeEntries = dayEntries.filter((item) => cashType(item) === 'saida')
  const byMethod = (method) => paidIncomeEntries
    .filter((item) => cashMethod(item) === method)
    .reduce((sum, item) => sum + cashServiceValue(item), 0)
  const totalReceived = paidIncomeEntries.reduce((sum, item) => sum + cashServiceValue(item), 0)
  const outcome = outcomeEntries.reduce((sum, item) => sum + cashValue(item), 0)
  const commission = paidIncomeEntries.reduce((sum, item) => sum + cashCommissionValue(item), 0)
  const salonProfit = paidIncomeEntries.reduce((sum, item) => sum + cashSalonValue(item), 0)

  return {
    date,
    entries: dayEntries,
    paidIncomeEntries,
    pendingIncomeEntries,
    outcomeEntries,
    totalReceived,
    pix: byMethod('pix'),
    cash: byMethod('dinheiro'),
    debit: byMethod('debito'),
    credit: byMethod('credito'),
    pending: pendingIncomeEntries.reduce((sum, item) => sum + cashServiceValue(item), 0),
    outcome,
    commission,
    salonProfit,
    balance: totalReceived - outcome
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
  const employeeType = toEmployeeType(field(row, 'employeeType', 'employee_type') ?? field(row, 'tipoUsuario', 'tipo_usuario') ?? (['cashier', 'caixa'].includes(rawRole) ? 'cashier' : 'professional'))
  const rawFunctions = employeeType === 'cashier' ? [] : (field(row, 'functions') ?? field(row, 'funcoes') ?? field(row, 'position') ?? (!['admin', 'cashier', 'professional', 'caixa', 'profissional'].includes(String(rawRole ?? '').toLowerCase()) ? rawRole : '') ?? '')
  const professional = employeeType === 'professional'
  const status = field(row, 'status') || 'ativo'
  const loginStatus = field(row, 'loginStatus', 'login_status') ?? ''
  const commissionPercent = Number(field(row, 'commission_percent') ?? field(row, 'commission') ?? 0)
  return {
    ...row,
    salon_id: field(row, 'salon_id') ?? field(row, 'salonId'),
    salonId: field(row, 'salonId', 'salon_id'),
    name: field(row, 'name') ?? field(row, 'employeeName', 'employee_name') ?? '',
    employeeName: field(row, 'employeeName', 'employee_name') ?? field(row, 'name') ?? '',
    employee_name: field(row, 'employee_name') ?? field(row, 'employeeName') ?? field(row, 'name') ?? '',
    phone: field(row, 'phone') ?? '',
    status,
    position: field(row, 'position') || rawFunctions,
    role: employeeType,
    functions: field(row, 'functions') ?? rawFunctions,
    email: field(row, 'email') ?? field(row, 'accessEmail', 'access_email') ?? field(row, 'login_email') ?? '',
    active: field(row, 'active') ?? status.toLowerCase() !== 'inativo',
    commission_percent: commissionPercent,
    commission: Number(field(row, 'commission') ?? commissionPercent ?? 0),
    workStatus: field(row, 'workStatus', 'work_status') ?? status,
    employeeType,
    tipoUsuario: employeeType === 'cashier' ? 'caixa' : employeeType === 'admin' ? 'admin' : 'profissional',
    tipo_usuario: field(row, 'tipo_usuario') ?? (employeeType === 'cashier' ? 'caixa' : employeeType === 'admin' ? 'admin' : 'profissional'),
    funcoes: professional ? toList(field(row, 'funcoes') ?? rawFunctions) : [],
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
    paymentMethod: normalizeAppointmentPaymentMethod(field(row, 'paymentMethod', 'payment_method')),
    paymentStatus: normalizePaymentStatus(field(row, 'paymentStatus', 'payment_status')),
    payment_status: normalizePaymentStatus(field(row, 'paymentStatus', 'payment_status'))
  }, employees)
}

function normalizeCashMovementRecord(row) {
  if (!row) return null
  const amount = Number(field(row, 'amount') ?? field(row, 'serviceValue', 'service_value') ?? field(row, 'value') ?? field(row, 'valor') ?? 0)
  const serviceValue = Number(field(row, 'serviceValue', 'service_value') ?? amount)
  const commissionValue = Number(field(row, 'commissionValue', 'commission_value') ?? 0)
  const rawPaymentMethod = field(row, 'paymentMethod', 'payment_method') ?? field(row, 'method') ?? null
  const normalizedPaymentMethod = normalizeAppointmentPaymentMethod(rawPaymentMethod)
  const cancelledAt = field(row, 'cancelledAt', 'cancelled_at')
  const status = cancelledAt ? 'cancelado' : normalizePaymentStatus(field(row, 'status') ?? field(row, 'paymentStatus', 'payment_status') ?? 'pendente')
  return {
    ...row,
    type: cashType({ type: field(row, 'type') ?? field(row, 'tipo') }) || 'entrada',
    tipo: cashType({ type: field(row, 'type') ?? field(row, 'tipo') }) || 'entrada',
    description: field(row, 'description') ?? field(row, 'descricao') ?? '',
    descricao: field(row, 'descricao') ?? field(row, 'description') ?? '',
    category: field(row, 'category') ?? field(row, 'categoria') ?? 'manual',
    categoria: field(row, 'categoria') ?? field(row, 'category') ?? 'manual',
    paymentMethod: normalizedPaymentMethod,
    payment_method: normalizedPaymentMethod,
    amount,
    amountFinal: amount,
    discount: Number(field(row, 'discount') ?? field(row, 'desconto') ?? 0),
    desconto: Number(field(row, 'desconto') ?? field(row, 'discount') ?? 0),
    notes: field(row, 'notes') ?? field(row, 'observacao') ?? '',
    observacao: field(row, 'observacao') ?? field(row, 'notes') ?? '',
    date: field(row, 'date') ?? field(row, 'data') ?? todayIso,
    data: field(row, 'data') ?? field(row, 'date') ?? todayIso,
    status,
    statusFinal: status,
    paymentStatus: status,
    payment_status: status,
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
    createdAt: field(row, 'createdAt', 'created_at'),
    created_at: field(row, 'created_at') ?? field(row, 'createdAt'),
    paymentMethodFinal: normalizedPaymentMethod ?? '',
    cancelledAt,
    cancelled_at: field(row, 'cancelled_at') ?? field(row, 'cancelledAt'),
    cancelledReason: field(row, 'cancelledReason', 'cancelled_reason') ?? '',
    cancelled_reason: field(row, 'cancelled_reason') ?? field(row, 'cancelledReason') ?? '',
    updatedAt: field(row, 'updatedAt', 'updated_at'),
    updated_at: field(row, 'updated_at') ?? field(row, 'updatedAt'),
    commissionPaid: Boolean(field(row, 'commissionPaid', 'commission_paid')),
    commission_paid: Boolean(field(row, 'commission_paid') ?? field(row, 'commissionPaid')),
    commissionPaidAt: field(row, 'commissionPaidAt', 'commission_paid_at'),
    commission_paid_at: field(row, 'commission_paid_at') ?? field(row, 'commissionPaidAt'),
    commissionPaymentMethod: field(row, 'commissionPaymentMethod', 'commission_payment_method') ?? '',
    commission_payment_method: field(row, 'commission_payment_method') ?? field(row, 'commissionPaymentMethod') ?? '',
    commissionNotes: field(row, 'commissionNotes', 'commission_notes') ?? '',
    commission_notes: field(row, 'commission_notes') ?? field(row, 'commissionNotes') ?? ''
  }
}

function normalizeCashClosureRecord(row) {
  return {
    ...row,
    date: field(row, 'date') ?? todayIso,
    totalReceived: Number(field(row, 'totalReceived', 'total_received') ?? 0),
    total_received: Number(field(row, 'total_received') ?? field(row, 'totalReceived') ?? 0),
    pix: Number(field(row, 'pix', 'pix_total') ?? 0),
    pix_total: Number(field(row, 'pix_total') ?? field(row, 'pix') ?? 0),
    cash: Number(field(row, 'cash', 'cash_total') ?? 0),
    cash_total: Number(field(row, 'cash_total') ?? field(row, 'cash') ?? 0),
    debit: Number(field(row, 'debit', 'debit_total') ?? 0),
    debit_total: Number(field(row, 'debit_total') ?? field(row, 'debit') ?? 0),
    credit: Number(field(row, 'credit', 'credit_total') ?? 0),
    credit_total: Number(field(row, 'credit_total') ?? field(row, 'credit') ?? 0),
    pending: Number(field(row, 'pending', 'pending_total') ?? 0),
    pending_total: Number(field(row, 'pending_total') ?? field(row, 'pending') ?? 0),
    outcome: Number(field(row, 'outcome', 'outcome_total') ?? 0),
    outcome_total: Number(field(row, 'outcome_total') ?? field(row, 'outcome') ?? 0),
    commission: Number(field(row, 'commission', 'commission_total') ?? 0),
    commission_total: Number(field(row, 'commission_total') ?? field(row, 'commission') ?? 0),
    salonProfit: Number(field(row, 'salonProfit', 'salon_profit') ?? 0),
    salon_profit: Number(field(row, 'salon_profit') ?? field(row, 'salonProfit') ?? 0),
    balance: Number(field(row, 'balance', 'final_balance') ?? 0),
    final_balance: Number(field(row, 'final_balance') ?? field(row, 'balance') ?? 0),
    notes: field(row, 'notes') ?? field(row, 'observacao') ?? '',
    observacao: field(row, 'observacao') ?? field(row, 'notes') ?? '',
    createdAt: field(row, 'createdAt', 'created_at'),
    created_at: field(row, 'created_at') ?? field(row, 'createdAt')
  }
}

function normalizeCommissionPaymentRecord(row) {
  return {
    ...row,
    employeeId: field(row, 'employeeId', 'employee_id'),
    employee_id: field(row, 'employee_id') ?? field(row, 'employeeId'),
    employeeName: field(row, 'employeeName', 'employee_name') ?? '',
    employee_name: field(row, 'employee_name') ?? field(row, 'employeeName') ?? '',
    amount: Number(field(row, 'amount') ?? 0),
    commissionGross: Number(field(row, 'commissionGross', 'commission_gross') ?? field(row, 'amount') ?? 0),
    commission_gross: Number(field(row, 'commission_gross') ?? field(row, 'commissionGross') ?? field(row, 'amount') ?? 0),
    advancesTotal: Number(field(row, 'advancesTotal', 'advances_total') ?? 0),
    advances_total: Number(field(row, 'advances_total') ?? field(row, 'advancesTotal') ?? 0),
    paymentMethod: field(row, 'paymentMethod', 'payment_method') ?? '',
    payment_method: field(row, 'payment_method') ?? field(row, 'paymentMethod') ?? '',
    notes: field(row, 'notes') ?? '',
    periodStart: field(row, 'periodStart', 'period_start') ?? '',
    period_start: field(row, 'period_start') ?? field(row, 'periodStart') ?? '',
    periodEnd: field(row, 'periodEnd', 'period_end') ?? '',
    period_end: field(row, 'period_end') ?? field(row, 'periodEnd') ?? '',
    paidAt: field(row, 'paidAt', 'paid_at'),
    paid_at: field(row, 'paid_at') ?? field(row, 'paidAt'),
    cashMovementIds: field(row, 'cashMovementIds', 'cash_movement_ids') ?? [],
    cash_movement_ids: field(row, 'cash_movement_ids') ?? field(row, 'cashMovementIds') ?? [],
    advanceIds: field(row, 'advanceIds', 'advance_ids') ?? [],
    advance_ids: field(row, 'advance_ids') ?? field(row, 'advanceIds') ?? []
  }
}

function normalizeAdvanceRecord(row) {
  const employeeName = field(row, 'employeeName', 'employee_name') ?? field(row, 'employee') ?? ''
  const cancelledAt = field(row, 'cancelledAt', 'cancelled_at')
  const status = cancelledAt ? 'cancelado' : normalizeAdvanceStatus(field(row, 'status'))
  const createdAt = field(row, 'createdAt', 'created_at') ?? todayIso
  const amount = Number(field(row, 'amount') ?? field(row, 'value') ?? 0)
  const notes = field(row, 'notes') ?? field(row, 'description') ?? ''
  return {
    ...row,
    employeeId: field(row, 'employeeId', 'employee_id'),
    employee_id: field(row, 'employee_id') ?? field(row, 'employeeId'),
    employeeName,
    employeeNameFinal: employeeName,
    employee_name: employeeName,
    amount,
    amountFinal: amount,
    createdAt,
    created_at: field(row, 'created_at') ?? field(row, 'createdAt') ?? createdAt,
    status,
    discountedAt: field(row, 'discountedAt', 'discounted_at'),
    discounted_at: field(row, 'discounted_at') ?? field(row, 'discountedAt'),
    cancelledAt,
    cancelled_at: field(row, 'cancelled_at') ?? field(row, 'cancelledAt'),
    cancelledReason: field(row, 'cancelledReason', 'cancelled_reason') ?? '',
    cancelled_reason: field(row, 'cancelled_reason') ?? field(row, 'cancelledReason') ?? '',
    notes,
    notesFinal: notes
  }
}

function normalizeAuditLogRecord(row) {
  return {
    ...row,
    userId: field(row, 'userId', 'user_id'),
    user_id: field(row, 'user_id') ?? field(row, 'userId'),
    userName: field(row, 'userName', 'user_name') ?? '',
    user_name: field(row, 'user_name') ?? field(row, 'userName') ?? '',
    action: field(row, 'action') ?? '',
    entityType: field(row, 'entityType', 'entity_type') ?? '',
    entity_type: field(row, 'entity_type') ?? field(row, 'entityType') ?? '',
    entityId: field(row, 'entityId', 'entity_id'),
    entity_id: field(row, 'entity_id') ?? field(row, 'entityId'),
    oldData: field(row, 'oldData', 'old_data'),
    old_data: field(row, 'old_data') ?? field(row, 'oldData'),
    newData: field(row, 'newData', 'new_data'),
    new_data: field(row, 'new_data') ?? field(row, 'newData'),
    reason: field(row, 'reason') ?? '',
    createdAt: field(row, 'createdAt', 'created_at'),
    created_at: field(row, 'created_at') ?? field(row, 'createdAt')
  }
}

async function recordAuditLog({ salonId, user, action, entityType, entityId, oldData, newData, reason, onCreated }) {
  const trimmedReason = String(reason ?? '').trim()
  if (!trimmedReason) {
    console.warn('Auditoria ignorada: motivo ausente.', { salonId, action, entityType, entityId })
    return null
  }
  try {
    const createdLog = await createAuditLogRecord(salonId, {
      userId: user?.id ?? null,
      userName: user?.name ?? user?.email ?? 'Usuário',
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      oldData: oldData ?? null,
      newData: newData ?? null,
      reason: trimmedReason,
      createdAt: new Date().toISOString()
    })
    if (!createdLog) return null
    const savedLog = normalizeAuditLogRecord(createdLog)
    onCreated?.(savedLog)
    return savedLog
  } catch (error) {
    console.error('Erro audit_logs Supabase:', error?.original ?? error)
    return null
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
  return error?.original?.message || error?.message || 'Não foi possível salvar no banco de dados.'
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
  { id: 'auditoria', label: 'Auditoria' },
  { id: 'configuracoes', label: 'Configurações' }
]

const cashierMenu = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'caixa', label: 'Caixa' },
  { id: 'vales', label: 'Vales' }
]

const professionalMenu = [
  { id: 'minha-agenda', label: 'Minha Agenda' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'perfil', label: 'Perfil' }
]

const statusStyles = {
  agendado: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-400/30 dark:bg-orange-500/15 dark:text-orange-200',
  confirmado: 'border-violet-100 bg-lilacSoft/40 text-violet-800 dark:border-violet-300/30 dark:bg-violet-500/20 dark:text-violet-100',
  em_atendimento: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-400/30 dark:bg-cyan-500/15 dark:text-cyan-200',
  aguardando_pagamento: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-400/30 dark:bg-yellow-500/15 dark:text-yellow-200',
  concluido: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200',
  cancelado: 'border-red-200 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-200'
}

const appointmentStatusCardStyles = {
  agendado: 'border-orange-300 bg-orange-50/85 text-orange-950 dark:border-orange-400/45 dark:bg-orange-500/15 dark:text-orange-50',
  confirmado: 'border-violet-300 bg-violet-50/85 text-violet-950 dark:border-violet-300/45 dark:bg-violet-500/15 dark:text-violet-50',
  em_atendimento: 'border-cyan-300 bg-cyan-50/85 text-cyan-950 dark:border-cyan-400/45 dark:bg-cyan-500/15 dark:text-cyan-50',
  aguardando_pagamento: 'border-yellow-300 bg-yellow-50/85 text-yellow-950 dark:border-yellow-400/45 dark:bg-yellow-500/15 dark:text-yellow-50',
  concluido: 'border-emerald-300 bg-emerald-50/85 text-emerald-950 dark:border-emerald-400/45 dark:bg-emerald-500/15 dark:text-emerald-50',
  cancelado: 'border-red-300 bg-red-50/85 text-red-950 dark:border-red-400/45 dark:bg-red-500/15 dark:text-red-50'
}

const appointmentStatusDetailStyles = {
  agendado: 'text-orange-700 dark:text-orange-200',
  confirmado: 'text-violet-700 dark:text-violet-200',
  em_atendimento: 'text-cyan-700 dark:text-cyan-200',
  aguardando_pagamento: 'text-yellow-700 dark:text-yellow-200',
  concluido: 'text-emerald-700 dark:text-emerald-200',
  cancelado: 'text-red-700 dark:text-red-200'
}

const appointmentStatusTextStyles = {
  agendado: 'text-[#f59e0b]',
  confirmado: 'text-[#8b5cf6]',
  em_atendimento: 'text-[#06b6d4]',
  aguardando_pagamento: 'text-[#eab308]',
  concluido: 'text-[#22c55e]',
  cancelado: 'text-[#ef4444]'
}

function getAppointmentStatusClass(status) {
  return appointmentStatusCardStyles[normalizeAppointmentStatus(status)] ?? appointmentStatusCardStyles.agendado
}

function getAppointmentStatusDetailClass(status) {
  return appointmentStatusDetailStyles[normalizeAppointmentStatus(status)] ?? appointmentStatusDetailStyles.agendado
}

function getAppointmentStatusTextClass(status) {
  return appointmentStatusTextStyles[normalizeAppointmentStatus(status)] ?? appointmentStatusTextStyles.agendado
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

const premiumSuccessMessages = {
  saved: '✔ Alterações salvas com sucesso',
  payment: '✔ Pagamento registrado com sucesso',
  advance: '✔ Vale criado com sucesso',
  updated: '✔ Registro atualizado com sucesso'
}

function getPremiumSuccessMessage(text) {
  const normalizedText = String(text ?? '').toLowerCase()

  if (normalizedText.includes('pagamento') || normalizedText.includes('recebido')) return premiumSuccessMessages.payment
  if (normalizedText.includes('vale criado')) return premiumSuccessMessages.advance
  if (
    normalizedText.includes('exclu') ||
    normalizedText.includes('cancel') ||
    normalizedText.includes('remov') ||
    normalizedText.includes('desativ') ||
    normalizedText.includes('marcado como pendente') ||
    normalizedText.includes('marcado como pago') ||
    normalizedText.includes('marcada como paga') ||
    normalizedText.includes('atualizado')
  ) return premiumSuccessMessages.updated
  if (
    normalizedText.includes('salvo') ||
    normalizedText.includes('salva') ||
    normalizedText.includes('criado') ||
    normalizedText.includes('criada') ||
    normalizedText.includes('fechado')
  ) return premiumSuccessMessages.saved

  return text
}

function showSuccess(message, onToast) {
  if (typeof onToast === 'function') {
    onToast(message)
    return
  }
  if (typeof window !== 'undefined' && window?.toast?.success) {
    window.toast.success(message)
  } else if (typeof window !== 'undefined') {
    window.alert(message)
  }
}

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
    salon_id: profile.salon_id,
    salonId: profile.salon_id,
    role,
    dbRole: profile.role,
    employeeId: employee?.id,
    name: employee?.name ?? profile.name,
    title: getRoleTitle(role),
    email: profile.email,
    phone: employee?.phone ?? ''
  }
}

function createAdminFallbackUser(authUser) {
  const email = authUser?.email ?? ''
  return {
    id: authUser?.id ?? 'auth-admin',
    salon_id: null,
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
  if (role === 'cashier') return 'caixa'
  if (role === 'professional') return 'minha-agenda'
  return 'caixa'
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
  const [commissionPayments, setCommissionPayments] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
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
    setCommissionPayments([])
    setAuditLogs([])
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

    console.log('salon_id usado nas buscas:', salonId)
    setDataLoading(true)
    try {
      let [
        salonRow,
        clientRows,
        employeeRows,
        serviceRows,
        appointmentRows,
        cashMovementRows,
        cashClosureRows,
        commissionPaymentRows,
        auditLogRows,
        advanceRows,
        stockRows
      ] = await Promise.all([
        fetchSalon(salonId),
        fetchClientsFromSupabase(salonId),
        fetchEmployeesFromSupabase(salonId),
        fetchServicesFromSupabase(salonId),
        fetchAppointmentsFromSupabase(salonId),
        fetchCashMovementsFromSupabase(salonId),
        fetchCashClosuresFromSupabase(salonId),
        fetchCommissionPaymentsFromSupabase(salonId),
        fetchAuditLogsFromSupabase(salonId),
        fetchAdvancesFromSupabase(salonId),
        fetchStockItemsFromSupabase(salonId)
      ])

      console.log('salon atual carregado:', salonRow)
      console.log('resultado de employees:', employeeRows)

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
            console.log('resultado de employees apos seed:', employeeRows)
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
      const advanceCashEntries = normalizedAdvances.filter(isValidAdvance).map((advance) => createAdvanceCashEntry(advance))

      setSalonSettings(normalizeSalonSettings(salonRow ?? {}))
      setClients((clientRows ?? []).map(normalizeClientRecord))
      setEmployees(normalizedEmployees)
      setServiceItems(normalizedServices)
      setAppointments(normalizedAppointments)
      setCashEntries([...(cashMovementRows ?? []).map(normalizeCashMovementRecord), ...advanceCashEntries])
      setCashClosures((cashClosureRows ?? []).map(normalizeCashClosureRecord))
      setCommissionPayments((commissionPaymentRows ?? []).map(normalizeCommissionPaymentRecord))
      setAuditLogs((auditLogRows ?? []).map(normalizeAuditLogRecord))
      setAdvances(normalizedAdvances)
      setInventoryItems((stockRows ?? []).map(normalizeStockItemRecord))
      setDatabaseStatus({ notConfigured: false, message: '' })
    } catch (error) {
      console.error('erro real do Supabase:', error?.original ?? error)
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
    console.log("USER:", user)
    console.log("SALON_ID:", user?.salon_id)
    const salonId = user.salon_id ?? user.salonId ?? null

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
    if (type === 'success') {
      showSuccess(getPremiumSuccessMessage(text), (message) => setToast({ text: message, type, id: Date.now() }))
      return
    }
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
      if (!(user?.salon_id ?? user?.salonId)) notify('Salão ainda não vinculado.', 'info')
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
                commissionPayments={commissionPayments}
                setCommissionPayments={setCommissionPayments}
                auditLogs={auditLogs}
                setAuditLogs={setAuditLogs}
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
    ...(user.role === 'admin' ? services.filter((item) => item.name.toLowerCase().includes(search)).map((item) => ({ label: item.name, detail: 'Serviço', page: 'servicos' })) : []),
    ...(user.role === 'admin' ? employees.filter((item) => item.name.toLowerCase().includes(search)).map((item) => ({ label: item.name, detail: 'Funcionário', page: 'funcionarios' })) : []),
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

function PageRouter({ page, user, salonId, databaseStatus, dataLoading, appointments, setAppointments, clients, setClients, cashEntries, setCashEntries, cashClosures, setCashClosures, commissionPayments, setCommissionPayments, auditLogs, setAuditLogs, advances, setAdvances, blockedSlots, setBlockedSlots, inventoryItems, setInventoryItems, employees, setEmployees, services, setServices, salonSettings, setSalonSettings, agendaProfessional, setAgendaProfessional, onOpenAgendaForProfessional, notify }) {
  const employeeAppointments = appointments.filter((item) => getAppointmentEmployeeName(item, employees) === user.name)
  const visibleAppointments = appointments
  const activeClients = clients.filter((client) => client.active)
  const professionals = getProfessionals(employees)

  if (dataLoading) return <DataLoading />

  const pages = {
    dashboard: user.role === 'admin'
      ? <AdminDashboard appointments={appointments} employees={employees} clients={clients} cashEntries={cashEntries} advances={advances} />
      : <CashierDashboard appointments={appointments} employees={employees} cashEntries={cashEntries} advances={advances} />,
    agenda: <Agenda salonId={salonId} appointments={visibleAppointments} setAppointments={setAppointments} user={user} clients={activeClients} employees={professionals} allEmployees={employees} blockedSlots={blockedSlots} setBlockedSlots={setBlockedSlots} cashEntries={cashEntries} setCashEntries={setCashEntries} salonSettings={salonSettings} initialProfessionalFilter={agendaProfessional} onProfessionalFilterChange={setAgendaProfessional} notify={notify} />,
    clientes: <Clients salonId={salonId} user={user} clients={clients} setClients={setClients} appointments={appointments} notify={notify} />,
    servicos: user.role === 'admin' ? <Services salonId={salonId} user={user} services={services} setServices={setServices} notify={notify} /> : <AccessDenied />,
    funcionarios: user.role === 'admin' ? <Employees salonId={salonId} user={user} employees={employees} setEmployees={setEmployees} appointments={appointments} salonSettings={salonSettings} onOpenAgendaForProfessional={onOpenAgendaForProfessional} notify={notify} /> : <AccessDenied />,
    caixa: <CashRegister salonId={salonId} user={user} entries={cashEntries} setEntries={setCashEntries} closures={cashClosures} setClosures={setCashClosures} appointments={appointments} setAppointments={setAppointments} employees={employees} advances={advances} serviceItems={services} setAuditLogs={setAuditLogs} notify={notify} />,
    vales: user.role === 'admin' || user.role === 'cashier' ? <Advances salonId={salonId} user={user} employees={employees} advances={advances} setAdvances={setAdvances} setCashEntries={setCashEntries} setAuditLogs={setAuditLogs} notify={notify} /> : <AccessDenied />,
    estoque: user.role === 'admin' ? <Inventory user={user} items={inventoryItems} setItems={setInventoryItems} notify={notify} /> : <AccessDenied />,
    relatorios: user.role === 'admin' ? <Reports salonId={salonId} appointments={appointments} employees={employees} cashEntries={cashEntries} setCashEntries={setCashEntries} advances={advances} setAdvances={setAdvances} commissionPayments={commissionPayments} setCommissionPayments={setCommissionPayments} user={user} salonSettings={salonSettings} setAuditLogs={setAuditLogs} notify={notify} /> : <AccessDenied />,
    auditoria: user.role === 'admin' ? <AuditTrail auditLogs={auditLogs} /> : <AccessDenied />,
    perfil: <EmployeeProfile user={user} appointments={employeeAppointments} employees={employees} setEmployees={setEmployees} />,
    'minha-agenda': <ProfessionalAgenda user={user} appointments={employeeAppointments} employees={employees} blockedSlots={blockedSlots} salonSettings={salonSettings} notify={notify} />,
    configuracoes: user.role === 'admin' ? <Settings salonId={salonId} settings={salonSettings} setSettings={setSalonSettings} notify={notify} /> : <AccessDenied />
  }

  return pages[page] ?? <Agenda salonId={salonId} appointments={visibleAppointments} setAppointments={setAppointments} user={user} clients={activeClients} employees={professionals} allEmployees={employees} blockedSlots={blockedSlots} setBlockedSlots={setBlockedSlots} cashEntries={cashEntries} setCashEntries={setCashEntries} salonSettings={salonSettings} initialProfessionalFilter={agendaProfessional} onProfessionalFilterChange={setAgendaProfessional} notify={notify} />
}

function CashierDashboard({ appointments, employees, cashEntries, advances }) {
  const summary = buildCashClosureSummary(cashEntries, todayIso)
  const validAdvances = advances.filter(isValidAdvance)
  const dayAppointments = appointments.filter((item) => item.date === todayIso && !isCancelledStatus(item.status))
  const waitingPayments = dayAppointments.filter((item) => normalizeAppointmentStatus(item.status) === 'em_atendimento' || normalizeAppointmentStatus(item.status) === 'aguardando_pagamento')
  const nextAppointments = dayAppointments
    .slice()
    .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')))
    .slice(0, 6)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-bold text-graphite dark:text-gray-100">Dashboard do caixa</h3>
        <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">Resumo operacional do dia, sem áreas administrativas.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Total do dia" value={money.format(summary.totalReceived)} detail="Entradas pagas" />
        <Metric title="Dinheiro" value={money.format(summary.cash)} detail="Recebido hoje" />
        <Metric title="Pix" value={money.format(summary.pix)} detail="Recebido hoje" />
        <Metric title="Cartão" value={money.format(summary.debit + summary.credit)} detail="Débito e crédito" />
        <Metric title="Atendimentos pendentes" value={String(waitingPayments.length)} detail="Aguardando finalização" />
        <Metric title="Saídas / sangria" value={money.format(summary.outcome)} detail="Movimentos do dia" />
        <Metric title="Vales pendentes" value={money.format(validAdvances.filter((item) => advanceStatus(item) === 'pendente').reduce((sum, item) => sum + advanceValue(item), 0))} detail="Sem vales cancelados" />
        <Metric title="Resultado do dia" value={money.format(summary.balance)} detail="Entradas - saídas" />
      </div>
      <Panel title="Agenda do dia">
        <div className="space-y-3">
          {nextAppointments.map((item) => (
            <div key={item.id} className="rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-graphite dark:text-gray-100">{item.time} · {item.client}</p>
                <StatusBadge tone={appointmentStatusTone(item.status)}>{formatAppointmentStatus(item.status)}</StatusBadge>
              </div>
              <p className="mt-1 font-semibold text-gray-600 dark:text-gray-300">{item.service} com {getAppointmentEmployeeName(item, employees)}</p>
            </div>
          ))}
          {nextAppointments.length === 0 && <EmptyState>Nenhum atendimento agendado para hoje.</EmptyState>}
        </div>
      </Panel>
    </div>
  )
}

function AdminDashboard({ appointments, employees, clients, cashEntries, advances }) {
  const professionals = getProfessionals(employees)
  const paidIncomeEntries = cashEntries.filter(isPaidIncomeCashEntry)
  const paidAppointmentEntries = paidIncomeEntries.filter(isAppointmentCashEntry)
  const currentMonth = todayIso.slice(0, 7)
  const dayPaidIncomeEntries = paidIncomeEntries.filter((item) => cashDate(item) === todayIso)
  const monthPaidIncomeEntries = paidIncomeEntries.filter((item) => String(cashDate(item)).startsWith(currentMonth))
  const dayRevenue = dayPaidIncomeEntries.reduce((sum, item) => sum + cashServiceValue(item), 0)
  const monthRevenue = monthPaidIncomeEntries.reduce((sum, item) => sum + cashServiceValue(item), 0)
  const commissions = professionals.map((employee) => ({ name: employee.name, value: paidAppointmentEntries.filter((item) => String(field(item, 'employeeId', 'employee_id') ?? '') === String(employee.id) || cashEmployeeName(item) === employee.name).reduce((sum, item) => sum + cashCommissionValue(item), 0) }))
  const todayPaidAppointmentEntries = paidAppointmentEntries.filter((item) => cashDate(item) === todayIso)
  const dayCommissions = todayPaidAppointmentEntries.reduce((sum, item) => sum + cashCommissionValue(item), 0)
  const monthCommissions = paidAppointmentEntries.filter((item) => String(cashDate(item)).startsWith(currentMonth)).reduce((sum, item) => sum + cashCommissionValue(item), 0)
  const topClient = topEntries(countBy(paidAppointmentEntries, (item) => cashClientName(item)), 1)[0]
  const busyHours = topEntries(countBy(appointments.filter((item) => !isCancelledStatus(item.status)), (item) => item.time?.slice(0, 2) + ':00'))
  const bestWeekday = topEntries(paidIncomeEntries.reduce((acc, item) => ({ ...acc, [getWeekdayLabel(cashDate(item))]: (acc[getWeekdayLabel(cashDate(item))] || 0) + cashServiceValue(item) }), {}), 1)[0]
  const serviceRevenue = topEntries(paidAppointmentEntries.reduce((acc, item) => ({ ...acc, [cashServiceName(item) || 'Serviço']: (acc[cashServiceName(item) || 'Serviço'] || 0) + cashServiceValue(item) }), {}))
  const serviceSales = topEntries(countBy(paidAppointmentEntries, (item) => cashServiceName(item) || 'Serviço'))
  const serviceCommissions = topEntries(paidAppointmentEntries.reduce((acc, item) => ({ ...acc, [cashServiceName(item) || 'Serviço']: (acc[cashServiceName(item) || 'Serviço'] || 0) + cashCommissionValue(item) }), {}))
  const cashIncome = paidIncomeEntries.reduce((sum, item) => sum + cashSalonValue(item), 0)
  const dashboardByMethod = (methods) => paidIncomeEntries.filter((item) => methods.includes(cashMethod(item))).reduce((sum, item) => sum + cashServiceValue(item), 0)
  const pendingPaymentsTotal = cashEntries.filter(isPendingIncomeCashEntry).reduce((sum, item) => sum + cashServiceValue(item), 0)
  const cashOutcome = cashEntries.filter((item) => isActiveCashEntry(item) && cashType(item) === 'saida').reduce((sum, item) => sum + cashValue(item), 0)
  const validAdvances = advances.filter(isValidAdvance)
  const dayAdvances = validAdvances.filter((item) => advanceCreatedDate(item) === todayIso).reduce((sum, item) => sum + advanceValue(item), 0)
  const monthAdvances = validAdvances.filter((item) => advanceCreatedDate(item).startsWith(currentMonth)).reduce((sum, item) => sum + advanceValue(item), 0)
  const pendingAdvances = validAdvances.filter((item) => advanceStatus(item) === 'pendente').reduce((sum, item) => sum + advanceValue(item), 0)
  const faturamentoHoje = dayRevenue
  const resumoMensagem = faturamentoHoje > 0
    ? `Hoje você já faturou ${faturamentoHoje.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : 'Nenhum faturamento registrado hoje. Vamos começar?'

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-bold text-graphite dark:text-gray-100">{uiText.dashboard.title}</h3>
        <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">{uiText.dashboard.subtitle}</p>
      </div>
      <section className="rounded-2xl border border-[#d9c17a]/70 bg-gradient-to-r from-white via-[#fff8e8] to-[#f7eef8] px-5 py-4 shadow-soft dark:border-[#d9c17a]/30 dark:from-[#1f1b26] dark:via-[#282235] dark:to-[#231c28]">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c9a85d]">Resumo de hoje</p>
        <p className="mt-1 text-lg font-black text-graphite dark:text-gray-100">{resumoMensagem}</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title={uiText.dashboard.todayRevenue} value={money.format(dayRevenue)} detail={uiText.dashboard.todayRevenueHelp} />
        <Metric title={uiText.dashboard.monthRevenue} value={money.format(monthRevenue)} detail={uiText.dashboard.monthRevenueHelp} />
        <Metric title={uiText.dashboard.todayCommissions} value={money.format(dayCommissions)} detail={uiText.dashboard.todayCommissionsHelp} />
        <Metric title={uiText.dashboard.monthCommissions} value={money.format(monthCommissions)} detail={uiText.dashboard.monthCommissionsHelp} />
        <Metric title={uiText.dashboard.pix} value={money.format(dashboardByMethod(['PIX', 'Pix', 'pix']))} detail={uiText.dashboard.pixHelp} />
        <Metric title={uiText.dashboard.money} value={money.format(dashboardByMethod(['Dinheiro', 'dinheiro']))} detail={uiText.dashboard.moneyHelp} />
        <Metric title={uiText.dashboard.card} value={money.format(dashboardByMethod(['debito', 'credito']))} detail={uiText.dashboard.cardHelp} />
        <Metric title={uiText.dashboard.pending} value={money.format(pendingPaymentsTotal)} detail={uiText.dashboard.pendingHelp} />
        <Metric title="Vales do dia" value={money.format(dayAdvances)} detail="Adiantamentos criados hoje" />
        <Metric title="Vales do mês" value={money.format(monthAdvances)} detail="Adiantamentos do mês" />
        <Metric title="Vales pendentes" value={money.format(pendingAdvances)} detail="Adiantamentos pendentes" />
        <Metric title={uiText.dashboard.netResult} value={money.format(cashIncome - cashOutcome)} detail={uiText.dashboard.netResultHelp} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel title={uiText.dashboard.weeklyRevenue}>
          <WeeklyRevenueChart cashEntries={cashEntries} />
        </Panel>
        <Panel title={uiText.dashboard.bestSellingServices}>
          <CompactList items={serviceSales.map(([label, count]) => `${label}: ${count} venda(s)`)} />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title={uiText.dashboard.commissionByProfessional}>
          <div className="space-y-3">
            {commissions.map((item) => <LineItem key={item.name} label={item.name} value={money.format(item.value)} />)}
          </div>
        </Panel>
        <Panel title={uiText.dashboard.commissionByService}>
          <CompactList items={serviceCommissions.length ? serviceCommissions.map(([label, value]) => `${label}: ${money.format(value)}`) : [uiText.reports.noCommission]} />
        </Panel>
        <Panel title={uiText.dashboard.frequentClient}>
          <CompactList items={[topClient ? `${topClient[0]}: ${topClient[1]} visita(s)` : uiText.reports.noData]} />
        </Panel>
        <Panel title={uiText.dashboard.busyHours}>
          <CompactList items={busyHours.length ? busyHours.map(([label, count]) => `${label}: ${count} agendamento(s)`) : [uiText.reports.noData]} />
        </Panel>
        <Panel title={uiText.dashboard.bestRevenueDay}>
          <CompactList items={[bestWeekday ? `${bestWeekday[0]}: ${money.format(bestWeekday[1])}` : uiText.reports.noData]} />
        </Panel>
        <Panel title={uiText.dashboard.profitableServices}>
          <CompactList items={serviceRevenue.length ? serviceRevenue.map(([label, value]) => `${label}: ${money.format(value)}`) : [uiText.reports.noData]} />
        </Panel>
        <Panel title={uiText.dashboard.cashFlow}>
          <LineItem label="Entradas" value={money.format(cashIncome)} positive />
          <LineItem label="Saídas" value={money.format(cashOutcome)} negative />
          <LineItem label={uiText.dashboard.dayResult} value={money.format(cashIncome - cashOutcome)} />
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

function WeeklyRevenueChart({ cashEntries }) {
  const [tooltip, setTooltip] = useState(null)
  const weekDates = getWeekDates(todayIso).slice(1).concat(getWeekDates(todayIso).slice(0, 1))
  const chartData = weekDates.map((date) => {
    const paidEntries = cashEntries.filter((item) => cashDate(item) === date && isPaidIncomeCashEntry(item))
    return {
      date,
      day: getWeekdayLabel(date).replace('.', ''),
      value: paidEntries.reduce((sum, item) => sum + cashServiceValue(item), 0),
      appointments: paidEntries.filter(isAppointmentCashEntry).length
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

  async function updateStatus(id, status) {
    const appointment = appointments.find((item) => item.id === id)
    if (!appointment) return false
    if (user.role !== 'admin' && user.role !== 'cashier' && getAppointmentEmployeeName(appointment, allEmployees) !== user.name) return false
    const normalizedStatus = normalizeAppointmentStatus(status)
    const paidCashEntry = cashEntries.find((entry) => String(cashAppointmentId(entry) ?? '') === String(appointment.id) && cashStatus(entry) === 'pago')
    if (isCompletedStatus(normalizedStatus) && !paidCashEntry) {
      notify?.('Receba o pagamento no caixa antes de concluir o atendimento.', 'error')
      return false
    }
    const optimistic = normalizeAppointmentRecord({ ...appointment, status: normalizedStatus }, allEmployees)
    setAppointments((current) => current.map((item) => item.id === id ? optimistic : item))
    const selectedPaymentMethod = normalizeAppointmentPaymentMethod(appointment.paymentMethod ?? cashMethod(paidCashEntry))
    const updatePayload = { status: normalizedStatus }
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
      status: 'em_atendimento',
      paymentMethod: selectedPaymentMethod,
      payment_method: selectedPaymentMethod || null,
      paymentStatus: 'pendente',
      payment_status: 'pendente'
    }
    try {
      const appointment = normalizeAppointmentRecord(await createAppointmentRecord(salonId, appointmentPayload), allEmployees)
      setAppointments((current) => [...current, appointment])
      setQuickModalOpen(false)
      notify?.('Atendimento rapido enviado para recebimento no caixa.')
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
      payment_method: selectedPaymentMethod || null,
      paymentStatus: 'pendente',
      payment_status: 'pendente'
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
      <Panel title={uiText.appointments.newAppointment}>
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
          <button disabled={!selectedSlotAvailable} className={`${buttonPrimary} w-full rounded-2xl px-4 py-3`}>{uiText.appointments.confirmButton}</button>
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
          <div className="simple-scrollbar h-[clamp(500px,75vh,880px)] space-y-3 overflow-y-auto overflow-x-visible scroll-smooth pr-2">
            {visibleBlocks.map((block) => (
              <div key={block.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="text-lg font-bold">{block.start} às {block.end} · Horário bloqueado</p>
                <p className="mt-1">{getBlockEmployeeName(block)} · {block.reason}</p>
              </div>
            ))}
            {[...visibleAppointments].sort((a, b) => getAppointmentSortKey(a).localeCompare(getAppointmentSortKey(b))).map((item) => {
              const statusDetailClass = getAppointmentStatusDetailClass(item.status)
              return (
                <div key={item.id} className={`${appointmentCardBase} ${getAppointmentStatusClass(item.status)}`}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold">{formatDate(item.date)} · {item.time} · {item.client}</p>
                      <p className={`mt-1 text-sm font-medium ${statusDetailClass}`}>{item.service} com {getAppointmentEmployeeName(item, allEmployees)}</p>
                      <p className={`mt-2 text-sm ${statusDetailClass}`}>Duração: {getAppointmentDuration(item, allEmployees.find((employee) => isAppointmentForEmployee(item, employee)))} min</p>
                      {user.role === 'admin' && <p className={`mt-2 text-sm font-semibold ${statusDetailClass}`}>{money.format(item.value)}</p>}
                    </div>
                    <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
                      <button type="button" onClick={() => sendConfirmation(item)} className={`${buttonSecondary} rounded-full px-3 py-2`}>{uiText.appointments.receiveButton}</button>
                      <AppointmentStatusSelect value={item.status} onChange={(status) => updateStatus(item.id, status)} roundedClass="rounded-full" />
                      {(user.role === 'admin' || user.role === 'cashier') && <button type="button" onClick={() => deleteAppointment(item)} className={`${buttonDanger} rounded-full px-3 py-2`}>Excluir</button>}
                    </div>
                  </div>
                </div>
              )
            })}
            {visibleAppointments.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-pearl px-4 py-5 text-sm font-semibold text-gray-600">
                Nenhum resultado encontrado para os filtros selecionados.
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
                      className={`block w-full rounded-xl border px-3 py-2 text-left text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${getAppointmentStatusClass(item.status)}`}
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
                <AppointmentStatusSelect
                  value={selectedItem.status}
                  roundedClass="rounded-xl"
                  onChange={async (status) => {
                    const changed = await onStatusChange(selectedItem.id, status)
                    if (changed) setSelectedItem({ ...selectedItem, status })
                  }}
                />
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
          <h3 className="text-xl font-bold">{uiText.services.title}</h3>
          <p className="text-sm text-gray-500">{uiText.services.subtitle}</p>
        </div>
        {canManage && <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>{uiText.services.newService}</button>}
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
              <button onClick={() => openEdit(item)} className={buttonSecondary}>{uiText.common.edit}</button>
              <button onClick={() => removeService(item)} className={buttonDanger}>{uiText.common.remove}</button>
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
    <Modal title={service ? uiText.services.editService : uiText.services.newService} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Field label={uiText.services.serviceName} value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={uiText.services.serviceValue} type="number" min="0" value={form.price} onChange={(value) => setForm({ ...form, price: value })} required />
          <Field label={uiText.services.duration} value={form.duration} onChange={(value) => setForm({ ...form, duration: value })} placeholder="Ex.: 1h 30min" required />
        </div>
        <Field label={uiText.services.commission} type="number" min="0" max="100" step="0.01" value={form.commissionPercent} onChange={(value) => setForm({ ...form, commissionPercent: value })} />
        <CheckboxGroup
          label="Função que realiza"
          options={employeeFunctionOptions}
          selected={selectedFunctions}
          onToggle={toggleFunction}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>{uiText.common.cancel}</button>
          <button className={buttonPrimary}>{uiText.common.save}</button>
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
    const employeeType = toEmployeeType(data.employeeType)
    const selectedFunctions = toList(data.selectedFunctions ?? data.role)
      .filter((option) => employeeFunctionOptions.includes(option))
    const employeeFunctions = employeeType === 'professional' ? selectedFunctions.join(', ') : ''
    const wantsLogin = Boolean(data.loginActive)
    const loginEmail = data.accessEmail?.trim().toLowerCase() ?? ''
    const temporaryPassword = data.temporaryPassword?.trim() ?? ''
    const employeeName = data.name.trim()
    if (!data.name.trim() || !data.phone.trim() || (employeeType === 'professional' && !employeeFunctions)) {
      notify?.(employeeType === 'professional' ? 'Erro ao salvar: informe nome, telefone e funções profissionais.' : 'Erro ao salvar: informe nome e telefone.', 'error')
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
      tipoUsuario: employeeType === 'cashier' ? 'caixa' : 'profissional',
      tipo_usuario: employeeType === 'cashier' ? 'caixa' : 'profissional',
      employeeName,
      employee_name: employeeName,
      role: employeeType,
      functions: employeeFunctions,
      funcoes: employeeType === 'professional' ? selectedFunctions : [],
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
      services: employeeType === 'professional' ? toList(data.services) : []
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
          <h3 className="text-xl font-bold">{uiText.employees.title}</h3>
          <p className="text-sm text-gray-500">{uiText.employees.subtitle}</p>
        </div>
        {canManage && <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3 sm:shrink-0`}>{uiText.employees.newEmployee}</button>}
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
          <p className="min-w-0 text-sm text-gray-600">Tipo de usuário: <strong>{item.employeeType === 'cashier' ? 'Caixa' : 'Profissional'}</strong></p>
          {isProfessional(item) && <p className="min-w-0 text-sm text-gray-600">Funções profissionais: <strong>{formatEmployeeFunctions(item.functions) || 'Não informado'}</strong></p>}
          <p className="min-w-0 text-sm text-gray-600">Login: <strong>{item.loginActive ? 'ativo' : 'inativo'}</strong></p>
          {canManage && <div className="mt-4 flex min-w-0 flex-wrap gap-2"><button onClick={() => openEdit(item)} className={buttonSecondary}>{uiText.common.edit}</button><button onClick={() => deactivateEmployee(item)} disabled={!item.active} className={buttonSecondary}>Desativar</button><button onClick={() => removeEmployee(item)} className={buttonDanger}>{uiText.common.remove}</button></div>}
        </div>
      )} />
      {modalOpen && <EmployeeModal employee={editing} salonSettings={salonSettings} onClose={() => setModalOpen(false)} onSave={saveEmployee} />}
    </div>
  )
}

function EmployeeModal({ employee, salonSettings, onClose, onSave }) {
  const initialEmployeeType = toEmployeeType(employee?.employeeType)
  const defaultAccessEmail = employee?.accessEmail ?? getSuggestedAccessEmail({ name: employee?.name, employeeType: initialEmployeeType, salonSettings })
  const [form, setForm] = useState(employee ? {
    ...employee,
    employeeType: initialEmployeeType,
    role: formatEmployeeFunctions(employee.functions),
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
    toList(employee ? employee.functions : '').filter((option) => employeeFunctionOptions.includes(option))
  ))
  const suggestedAccessEmail = getSuggestedAccessEmail({ name: form.name, employeeType: form.employeeType, salonSettings })

  function updateName(name) {
    const previousSuggestion = getSuggestedAccessEmail({ name: form.name, employeeType: form.employeeType, salonSettings })
    setForm((current) => ({
      ...current,
      name,
      accessEmail: !current.accessEmail || current.accessEmail === previousSuggestion
        ? getSuggestedAccessEmail({ name, employeeType: current.employeeType, salonSettings })
        : current.accessEmail
    }))
  }

  function updateEmployeeType(employeeType) {
    const previousSuggestion = getSuggestedAccessEmail({ name: form.name, employeeType: form.employeeType, salonSettings })
    if (employeeType === 'cashier') setSelectedFunctions([])
    setForm((current) => ({
      ...current,
      employeeType,
      role: employeeType === 'cashier' ? '' : current.role,
      commission: employeeType === 'cashier' ? 0 : current.commission,
      services: employeeType === 'cashier' ? [] : current.services,
      accessEmail: !current.accessEmail || current.accessEmail === previousSuggestion
        ? getSuggestedAccessEmail({ name: current.name, employeeType, salonSettings })
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
      accessEmail: getSuggestedAccessEmail({ name: current.name, employeeType: current.employeeType, salonSettings }),
      temporaryPassword: current.temporaryPassword || String(Math.floor(100000 + Math.random() * 900000)),
      loginActive: true
    }))
  }

  return (
    <Modal title={employee ? uiText.employees.editEmployee : uiText.employees.newEmployee} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, selectedFunctions }) }} className="space-y-3">
        <Field label="Nome" value={form.name} onChange={updateName} required />
        <Field label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required />
        <Select label="Tipo de usuário" value={form.employeeType} onChange={updateEmployeeType} options={['Profissional', 'Caixa']} values={['professional', 'cashier']} />
        {form.employeeType === 'professional' && <CheckboxGroup label="Funções profissionais" options={employeeFunctionOptions} selected={selectedFunctions} onToggle={toggleFunction} />}
        <section className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-bold">{uiText.employees.loginEmployee}</h4>
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
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className={buttonSecondary}>{uiText.common.cancel}</button><button className={buttonPrimary}>{uiText.common.save}</button></div>
      </form>
    </Modal>
  )
}
function CashRegister({ salonId, user, entries, setEntries, closures, setClosures, appointments = [], setAppointments, employees = [], advances = [], serviceItems = services, setAuditLogs, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [paymentAppointment, setPaymentAppointment] = useState(null)
  const [pendingPaidTarget, setPendingPaidTarget] = useState(null)
  const [cashDateFilter, setCashDateFilter] = useState(todayIso)
  const [closureModalOpen, setClosureModalOpen] = useState(false)
  const summary = buildCashClosureSummary(entries, cashDateFilter)
  const todayEntries = summary.entries
  const paidIncomeEntries = summary.paidIncomeEntries
  const byMethod = (methods) => {
    const methodList = Array.isArray(methods) ? methods : [methods]
    const aliases = methodList.map((method) => normalizeAppointmentPaymentMethod(method)).filter(Boolean)
    return paidIncomeEntries.filter((item) => aliases.includes(cashMethod(item))).reduce((sum, item) => sum + cashServiceValue(item), 0)
  }
  const income = summary.totalReceived
  const outcome = summary.outcome
  const commissionPaid = summary.commission
  const salonProfit = summary.salonProfit
  const pendingTotal = summary.pending
  const validAdvances = advances.filter(isValidAdvance)
  const paidAdvancesToday = validAdvances.filter((item) => advanceCreatedDate(item) === cashDateFilter).reduce((sum, item) => sum + advanceValue(item), 0)
  const pendingAdvances = validAdvances.filter((item) => advanceStatus(item) === 'pendente').reduce((sum, item) => sum + advanceValue(item), 0)
  const awaitingPaymentAppointments = appointments.filter((item) => {
    const entry = entries.find((cashEntry) => String(cashAppointmentId(cashEntry) ?? '') === String(item.id))
    const status = normalizeAppointmentStatus(item.status)
    return (status === 'em_atendimento' || status === 'aguardando_pagamento') && !entry
  })
  const cashDayAppointments = appointments
    .filter((item) => item.date === cashDateFilter && !isCancelledStatus(item.status))
    .slice()
    .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')))
  const pendingPayments = entries.filter(isPendingIncomeCashEntry)
  const employeeCommissions = Object.values(paidIncomeEntries.filter(isAppointmentCashEntry).reduce((acc, item) => {
    const key = String(field(item, 'employeeId', 'employee_id') ?? cashEmployeeName(item) ?? 'sem-profissional')
    const name = cashEmployeeName(item) || employees.find((employee) => String(employee.id) === key)?.name || 'Sem profissional'
    acc[key] = acc[key] ?? { name, value: 0, count: 0 }
    acc[key].value += cashCommissionValue(item)
    acc[key].count += isAppointmentCashEntry(item) ? 1 : 0
    return acc
  }, {})).sort((a, b) => b.value - a.value)
  const alreadyClosed = closures.some((item) => item.date === cashDateFilter)

  async function receiveAppointmentPayment(appointment, paymentMethod, paymentDetails = {}) {
    if (isCompletedStatus(appointment.status)) {
      notify?.('Atendimento já finalizado.', 'error')
      return
    }
    const originalValue = Number(appointment.value ?? appointment.valor ?? 0) || 0
    const discount = Math.min(Math.max(Number(paymentDetails.discount ?? 0) || 0, 0), originalValue)
    const normalizedMethod = normalizeAppointmentPaymentMethod(paymentMethod) ?? 'pendente'
    const paymentStatus = normalizedMethod === 'pendente' ? 'pendente' : 'pago'
    const appointmentStatus = paymentStatus === 'pago' ? 'concluido' : 'aguardando_pagamento'
    const payload = createCompletedAppointmentCashEntry({
      ...appointment,
      value: originalValue,
      valor: originalValue,
      discount,
      desconto: discount,
      notes: paymentDetails.notes ?? '',
      observacao: paymentDetails.notes ?? '',
      paymentMethod: normalizedMethod,
      payment_method: normalizedMethod,
      paymentStatus,
      payment_status: paymentStatus
    }, employees, serviceItems)

    try {
      const remoteEntry = entries.some((entry) => String(cashAppointmentId(entry) ?? '') === String(appointment.id))
        ? null
        : await fetchCashMovementByAppointmentFromSupabase(salonId, appointment.id)
      const existingEntry = entries.find((entry) => String(cashAppointmentId(entry) ?? '') === String(appointment.id))
        ?? (remoteEntry ? normalizeCashMovementRecord(remoteEntry) : null)
      const savedEntry = normalizeCashMovementRecord(existingEntry?.id
        ? await updateCashMovementRecord(salonId, existingEntry.id, payload)
        : await createCashMovementRecord(salonId, payload))
      const updatedAppointment = normalizeAppointmentRecord({
        ...appointment,
        ...(await updateAppointmentRecord(salonId, appointment.id, {
          status: appointmentStatus
        }))
      }, employees)

      setEntries((current) => {
        const exists = current.some((entry) => String(cashAppointmentId(entry) ?? '') === String(appointment.id))
        return exists
          ? current.map((entry) => String(cashAppointmentId(entry) ?? '') === String(appointment.id) ? savedEntry : entry)
          : [...current, savedEntry]
      })
      setAppointments?.((current) => current.map((item) => String(item.id) === String(appointment.id) ? updatedAppointment : item))
      setPaymentAppointment(null)
      notify?.(paymentStatus === 'pago' ? 'Pagamento recebido.' : 'Pagamento marcado como pendente.')
    } catch (error) {
      if (error?.code === '23505') {
        try {
          const duplicateRow = await fetchCashMovementByAppointmentFromSupabase(salonId, appointment.id)
          const duplicate = duplicateRow ? normalizeCashMovementRecord(duplicateRow) : null
          if (duplicate?.id) {
            const updatedDuplicate = normalizeCashMovementRecord(await updateCashMovementRecord(salonId, duplicate.id, payload))
            const updatedAppointment = normalizeAppointmentRecord({
              ...appointment,
              ...(await updateAppointmentRecord(salonId, appointment.id, {
                status: appointmentStatus
              }))
            }, employees)
            setEntries((current) => current.some((entry) => String(cashAppointmentId(entry) ?? '') === String(appointment.id))
              ? current.map((entry) => String(cashAppointmentId(entry) ?? '') === String(appointment.id) ? updatedDuplicate : entry)
              : [...current, updatedDuplicate])
            setAppointments?.((current) => current.map((item) => String(item.id) === String(appointment.id) ? updatedAppointment : item))
            setPaymentAppointment(null)
            notify?.('Movimento financeiro existente atualizado.')
            return
          }
        } catch (duplicateError) {
          handleDataActionError(duplicateError, notify)
          return
        }
      }
      handleDataActionError(error, notify)
    }
  }

  async function markPendingAsPaid(entry, reason) {
    if (!String(reason ?? '').trim()) {
      notify?.('Informe o motivo da alteração.', 'error')
      return
    }
    const appointmentId = cashAppointmentId(entry)
    const appointment = appointments.find((item) => String(item.id) === String(appointmentId))
    const normalizedMethod = normalizeAppointmentPaymentMethod(cashMethod(entry)) ?? 'pix'
    const payload = { ...entry, status: 'pago', paymentStatus: 'pago', payment_status: 'pago', paymentMethod: normalizedMethod, payment_method: normalizedMethod }
    const sameEntry = (item) => (entry.id !== undefined && item.id === entry.id) || (appointmentId && String(cashAppointmentId(item) ?? '') === String(appointmentId))

    try {
      const savedEntry = entry.id ? normalizeCashMovementRecord(await updateCashMovementRecord(salonId, entry.id, payload)) : normalizeCashMovementRecord(payload)
      await recordAuditLog({
        salonId,
        user,
        action: 'edicao_lancamento_financeiro',
        entityType: 'cash_movement',
        entityId: savedEntry.id ?? entry.id,
        oldData: entry,
        newData: savedEntry,
        reason,
        onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
      })
      setEntries((current) => current.map((item) => sameEntry(item) ? savedEntry : item))
      if (appointment?.id) {
        const updatedAppointment = normalizeAppointmentRecord({
          ...appointment,
          ...(await updateAppointmentRecord(salonId, appointment.id, {
            status: 'concluido'
          }))
        }, employees)
        setAppointments?.((current) => current.map((item) => String(item.id) === String(appointment.id) ? updatedAppointment : item))
      }
      setPendingPaidTarget(null)
      notify?.('Pagamento pendente marcado como pago.')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  function closeDay() {
    if (alreadyClosed && !window.confirm('O caixa de hoje já foi fechado. Registrar novo fechamento mesmo assim?')) return
    setClosures((current) => [...current, { id: Date.now(), date: todayIso, income, outcome, balance: income - outcome }])
    notify?.('Caixa do dia fechado com sucesso.')
  }

  function openCloseDayModal() {
    if (alreadyClosed) {
      notify?.('Caixa ja fechado para esta data.', 'error')
      return
    }
    setClosureModalOpen(true)
  }

  async function confirmCloseDay(notes = '') {
    if (alreadyClosed) {
      notify?.('Caixa ja fechado para esta data.', 'error')
      return
    }
    try {
      const savedClosure = normalizeCashClosureRecord(await createCashClosureRecord(salonId, {
        date: cashDateFilter,
        totalReceived: summary.totalReceived,
        pix: summary.pix,
        cash: summary.cash,
        debit: summary.debit,
        credit: summary.credit,
        pending: summary.pending,
        outcome: summary.outcome,
        commission: summary.commission,
        salonProfit: summary.salonProfit,
        balance: summary.balance,
        notes,
        observacao: notes,
        createdAt: new Date().toISOString()
      }))
      await recordAuditLog({
        salonId,
        user,
        action: 'fechamento_caixa',
        entityType: 'cash_closure',
        entityId: savedClosure.id,
        oldData: null,
        newData: savedClosure,
        reason: `Fechamento de caixa de ${formatDate(cashDateFilter)}`,
        onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
      })
      setClosures((current) => [savedClosure, ...current])
      setClosureModalOpen(false)
      notify?.('Caixa do dia fechado com sucesso.')
    } catch (error) {
      if (error?.code === '23505') {
        notify?.('Ja existe fechamento registrado para esta data.', 'error')
        return
      }
      handleDataActionError(error, notify)
    }
  }

  async function saveCashEntry(data) {
    const value = Number(data.value) || 0
    if (!data.description.trim() || value <= 0) {
      notify?.('Erro ao salvar: informe descrição e valor maior que zero.', 'error')
      return
    }
    const ownerWithdrawal = data.type === 'Retirada do dono'
    const cashOut = ownerWithdrawal || data.type === 'Sangria' || data.type === 'Saída' || data.type === 'Saida'
    if (ownerWithdrawal && !window.confirm(`Confirmar retirada do dono no valor de ${money.format(value)}?`)) return
    const selectedMethod = normalizeAppointmentPaymentMethod(data.paymentMethod) ?? 'pendente'
    const paymentStatus = selectedMethod === 'pendente' ? 'pendente' : 'pago'
    const payload = {
      id: Date.now(),
      type: data.type === 'Sangria' ? 'sangria' : cashOut ? 'saida' : 'entrada',
      description: data.description.trim(),
      category: ownerWithdrawal ? 'withdrawal' : data.type === 'Sangria' ? 'withdrawal' : data.category.trim() || 'manual',
      paymentMethod: selectedMethod,
      payment_method: selectedMethod,
      status: paymentStatus,
      amount: value,
      date: data.date
    }
    try {
      const savedEntry = normalizeCashMovementRecord(await createCashMovementRecord(salonId, payload))
      if (ownerWithdrawal) {
        await recordAuditLog({
          salonId,
          user,
          action: 'retirada_dono',
          entityType: 'cash_movement',
          entityId: savedEntry.id,
          oldData: null,
          newData: savedEntry,
          reason: `Retirada do dono: ${payload.description}`,
          onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
        })
      }
      setEntries((current) => [...current, savedEntry])
      setModalOpen(false)
      notify?.('Movimentação salva com sucesso.')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-blush/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#c9a85d]">{uiText.cash.title}</p>
            <h2 className="mt-2 text-2xl font-black text-graphite dark:text-gray-100">{uiText.cash.pdv}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">{uiText.cash.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModalOpen(true)} className="focus-ring whitespace-nowrap rounded-2xl border border-blush px-4 py-3 text-sm font-bold hover:bg-pearl dark:border-white/10 dark:hover:bg-white/10">{uiText.cash.newMovement}</button>
            <button onClick={openCloseDayModal} disabled={alreadyClosed} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>{alreadyClosed ? 'Caixa fechado' : uiText.cash.closeDay}</button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-xl font-bold text-graphite dark:text-gray-100">Resumo do dia</h3>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">Somente lançamentos financeiros recebidos entram no total do dia.</p>
        </div>
        <div className="w-full sm:w-56">
          <Field label="Data do caixa" type="date" value={cashDateFilter} onChange={setCashDateFilter} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Total recebido" value={money.format(income)} detail="Faturamento pago" />
        <Metric title="Pix" value={money.format(summary.pix)} detail="Recebido no dia" />
        <Metric title="Dinheiro" value={money.format(summary.cash)} detail="Recebido no dia" />
        <Metric title="Débito" value={money.format(byMethod(['Débito', 'debito']))} detail="Recebido hoje" />
        <Metric title="Crédito" value={money.format(byMethod(['Crédito', 'credito']))} detail="Recebido hoje" />
        <Metric title={uiText.cash.pendingPayments} value={money.format(pendingTotal)} detail={uiText.dashboard.pendingHelp} />
        <Metric title="Vales pagos hoje" value={money.format(paidAdvancesToday)} detail="Adiantamentos do dia" />
        <Metric title="Vales pendentes" value={money.format(pendingAdvances)} detail="Adiantamentos pendentes" />
        <Metric title="Comissão dos profissionais" value={money.format(commissionPaid)} detail="Sobre recebidos" />
        <Metric title="Lucro líquido do salão" value={money.format(salonProfit)} detail="Recebido - comissões" />
        <Metric title="Saídas" value={money.format(outcome)} detail="Despesas do dia" />
        <Metric title="Resultado do dia" value={money.format(income - outcome)} detail="Recebido - saídas" />
      </div>
      </section>

      <Panel title="Agenda do dia">
        <div className="space-y-3">
          {cashDayAppointments.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-graphite dark:text-gray-100">{item.time} · {item.client}</p>
                  <StatusBadge tone={appointmentStatusTone(item.status)}>{formatAppointmentStatus(item.status)}</StatusBadge>
                </div>
                <p className="mt-1 font-semibold text-gray-600 dark:text-gray-300">{item.service} com {getAppointmentEmployeeName(item, employees)} · {money.format(Number(item.value ?? item.valor ?? 0) || 0)}</p>
              </div>
              {(normalizeAppointmentStatus(item.status) === 'em_atendimento' || normalizeAppointmentStatus(item.status) === 'aguardando_pagamento') && (
                <button type="button" onClick={() => setPaymentAppointment(item)} className="focus-ring rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700">
                  Finalizar
                </button>
              )}
            </div>
          ))}
          {cashDayAppointments.length === 0 && <EmptyState>Nenhum atendimento agendado para esta data.</EmptyState>}
        </div>
      </Panel>

      <Panel title={uiText.cash.receivePayment}>
        <div className="space-y-3">
          {awaitingPaymentAppointments.map((item) => {
            const employee = employees.find((employeeItem) => isAppointmentForEmployee(item, employeeItem))
            const { comissaoCalculada } = calculateCommissionDetails(item, employee)
            const value = Number(item.value ?? item.valor ?? 0)
            const salonValue = value - comissaoCalculada
            return (
              <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-pearl px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-graphite dark:text-gray-100">{formatDate(item.date)} · {item.time} · {item.client}</p>
                    <StatusBadge tone="cyan">Em atendimento</StatusBadge>
                  </div>
                  <p className="mt-1 font-semibold text-gray-600 dark:text-gray-300">{item.service} com {getAppointmentEmployeeName(item, employees)}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                    <span>Valor: {money.format(value)}</span>
                    <span>Comissão: {money.format(comissaoCalculada)}</span>
                    <span>Salão: {money.format(salonValue)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setPaymentAppointment(item)} className="focus-ring rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700">
                    Receber pagamento
                  </button>
                </div>
              </div>
            )
          })}
          {awaitingPaymentAppointments.length === 0 && (
            <div className="rounded-2xl border border-gray-100 bg-pearl px-4 py-5 text-sm font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
              {uiText.cash.emptyPayments}
            </div>
          )}
        </div>
      </Panel>
      <Panel title={uiText.cash.pendingPayments}>
        <div className="space-y-3">
          {pendingPayments.map((item) => {
            const appointment = appointments.find((appointmentItem) => String(appointmentItem.id) === String(cashAppointmentId(item)))
            return (
              <div key={item.id ?? `${cashDescription(item)}-${cashValue(item)}`} className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-400/20 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-graphite dark:text-gray-100">{formatDate(item.date ?? item.data)} · {cashClientName(item) || cashDescription(item)}</p>
                    <StatusBadge tone="amber">Pendente</StatusBadge>
                  </div>
                  <p className="mt-1 font-semibold text-gray-600 dark:text-gray-300">{cashServiceName(item) || cashCategory(item)} · {cashEmployeeName(item) || 'Sem profissional'} · {money.format(cashServiceValue(item))}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {appointment && <button type="button" onClick={() => setPaymentAppointment(appointment)} className={buttonSecondary}>Receber pagamento</button>}
                  <button type="button" onClick={() => setPendingPaidTarget(item)} className="focus-ring rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700">Marcar como pago</button>
                  <button type="button" className="focus-ring rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:bg-amber-50 dark:border-amber-400/30 dark:bg-[#24202c] dark:text-amber-200">Manter pendente</button>
                </div>
              </div>
            )
          })}
          {pendingPayments.length === 0 && <EmptyState>Nenhum pagamento registrado neste período.</EmptyState>}
        </div>
      </Panel>
      <Panel title={uiText.cash.movements}>
        <Table
          rows={todayEntries}
          columns={['date', 'client', 'service', 'employee', 'paymentMethod', 'status', 'discount', 'amount', 'commission', 'salon']}
          labels={['Data', 'Cliente', 'Serviço', 'Profissional', 'Forma', 'Status', 'Desconto', 'Valor total', 'Comissão', 'Salão']}
          formatValue={(key, value, row) => {
            if (key === 'date') return formatDate(row.date ?? row.data ?? todayIso)
            if (key === 'client') return cashClientName(row) || cashDescription(row) || '-'
            if (key === 'service') return cashServiceName(row) || cashCategory(row) || '-'
            if (key === 'employee') return cashEmployeeName(row) || '-'
            if (key === 'paymentMethod') {
              const paymentMethod = cashMethod(row)
              return paymentMethod ? <PaymentMethodBadge method={paymentMethod} /> : '-'
            }
            if (key === 'status') {
              const status = cashStatus(row)
              return <StatusBadge tone={status === 'pago' ? 'green' : status === 'cancelado' ? 'rose' : 'amber'}>{status === 'pago' ? 'Pago' : status === 'cancelado' ? 'Cancelado' : 'Pendente'}</StatusBadge>
            }
            if (key === 'discount') return money.format(cashDiscount(row))
            if (key === 'amount') return money.format(cashType(row) === 'entrada' ? cashServiceValue(row) : cashValue(row))
            if (key === 'commission') return isAppointmentCashEntry(row) ? money.format(cashCommissionValue(row)) : '-'
            if (key === 'salon') return isAppointmentCashEntry(row) ? money.format(cashSalonValue(row)) : '-'
            return value
          }}
        />
        {todayEntries.length === 0 && <div className="mt-3"><EmptyState>Nenhuma movimentação registrada hoje.</EmptyState></div>}
      </Panel>
      <Panel title={uiText.cash.commissions}>
        <div className="space-y-3">
          {employeeCommissions.map((item) => <LineItem key={item.name} label={`${item.name} · ${item.count} atendimento(s)`} value={money.format(item.value)} positive />)}
          {employeeCommissions.length === 0 && <EmptyState>{uiText.reports.noCommission}</EmptyState>}
        </div>
      </Panel>
      <Panel title={uiText.cash.closings}>
        <CompactList items={closures.length ? closures.map((item) => `${formatDate(item.date)} · saldo ${money.format(item.balance)}`) : ['Nenhum fechamento registrado']} />
      </Panel>
      <Panel title="Fechamentos registrados - detalhes">
        {closures.length ? (
          <Table
            rows={closures}
            columns={['date', 'totalReceived', 'pix', 'cash', 'outcome', 'commission', 'salonProfit', 'balance']}
            labels={['Data', 'Recebido', 'Pix', 'Dinheiro', 'Saídas', 'Comissão', 'Lucro do salão', 'Resultado do dia']}
            formatValue={(key, value, row) => {
              if (key === 'date') return <StatusBadge tone="cyan">{formatDate(row.date)}</StatusBadge>
              return money.format(Number(value) || 0)
            }}
          />
        ) : (
          <EmptyState>Nenhum fechamento registrado.</EmptyState>
        )}
      </Panel>
      {modalOpen && <CashEntryModal onClose={() => setModalOpen(false)} onSave={saveCashEntry} />}
      {closureModalOpen && <CashClosureModal summary={summary} onClose={() => setClosureModalOpen(false)} onConfirm={confirmCloseDay} />}
      {paymentAppointment && <ReceivePaymentModal appointment={paymentAppointment} employees={employees} serviceItems={serviceItems} existingEntry={entries.find((entry) => String(cashAppointmentId(entry) ?? '') === String(paymentAppointment.id))} onClose={() => setPaymentAppointment(null)} onConfirm={receiveAppointmentPayment} />}
      {pendingPaidTarget && (
        <ReasonModal
          title="Marcar pagamento como pago"
          description="Informe o motivo para alterar o status financeiro deste lançamento."
          confirmLabel="Marcar como pago"
          onClose={() => setPendingPaidTarget(null)}
          onConfirm={(reason) => markPendingAsPaid(pendingPaidTarget, reason)}
        />
      )}
    </div>
  )
}

function CashClosureModal({ summary, onClose, onConfirm }) {
  const [notes, setNotes] = useState('')
  const rows = [
    ['Data do fechamento', formatDate(summary.date)],
    ['Total recebido', money.format(summary.totalReceived)],
    ['Pix', money.format(summary.pix)],
    ['Dinheiro', money.format(summary.cash)],
    ['Débito', money.format(summary.debit)],
    ['Crédito', money.format(summary.credit)],
    ['Pendentes', money.format(summary.pending)],
    ['Saídas', money.format(summary.outcome)],
    ['Comissão dos profissionais', money.format(summary.commission)],
    ['Lucro líquido do salão', money.format(summary.salonProfit)],
    ['Resultado do dia', money.format(summary.balance)]
  ]

  return (
    <Modal title="Confirmar fechamento de caixa" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
          Confira os valores antes de confirmar. Depois de salvo, o fechamento desta data não poderá ser duplicado.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-pearl p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-gray-400">{label}</p>
              <p className="mt-1 text-lg font-black text-graphite dark:text-gray-100">{value}</p>
            </div>
          ))}
        </div>
        <Field label="Observação" value={notes} onChange={setNotes} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button type="button" onClick={() => onConfirm(notes)} className={buttonPrimary}>Confirmar fechamento</button>
        </div>
      </div>
    </Modal>
  )
}

function ReceivePaymentModal({ appointment, employees, serviceItems, existingEntry, onClose, onConfirm }) {
  const existingMethod = normalizeAppointmentPaymentMethod(cashMethod(existingEntry) || appointment.paymentMethod || appointment.payment_method) ?? 'pix'
  const [paymentMethod, setPaymentMethod] = useState(existingMethod)
  const [discount, setDiscount] = useState(cashDiscount(existingEntry))
  const [notes, setNotes] = useState(field(existingEntry, 'notes') ?? field(existingEntry, 'observacao') ?? '')
  const service = serviceItems.find((item) => String(item.id) === String(appointment.serviceId ?? appointment.service_id) || item.name === appointment.service)
  const employee = employees.find((item) => isAppointmentForEmployee(appointment, item))
  const serviceValue = Number(appointment.value ?? appointment.valor ?? service?.price ?? 0) || 0
  const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), serviceValue)
  const finalValue = Math.max(serviceValue - safeDiscount, 0)
  const commissionPercent = Number(service?.commission_percent ?? service?.commissionPercent ?? employee?.commission ?? employee?.commission_percent ?? 0) || 0
  const commissionValue = finalValue * (commissionPercent / 100)
  const salonValue = finalValue - commissionValue
  const paymentStatus = paymentMethod === 'pendente' ? 'pendente' : 'pago'

  return (
    <Modal title="Receber pagamento" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onConfirm(appointment, paymentMethod, { discount: safeDiscount, notes }) }} className="space-y-4">
        <div className="rounded-2xl border border-blush bg-pearl p-4 text-sm font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-xs font-black uppercase text-gray-400">Cliente</p><p className="mt-1 text-graphite dark:text-gray-100">{appointment.client}</p></div>
            <div><p className="text-xs font-black uppercase text-gray-400">Serviço</p><p className="mt-1 text-graphite dark:text-gray-100">{service?.name ?? appointment.service}</p></div>
            <div><p className="text-xs font-black uppercase text-gray-400">Profissional</p><p className="mt-1 text-graphite dark:text-gray-100">{employee?.name ?? getAppointmentEmployeeName(appointment, employees)}</p></div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric title="Valor total" value={money.format(serviceValue)} detail="Valor do serviço" />
          <Metric title="Desconto" value={money.format(safeDiscount)} detail="Opcional" />
          <Metric title="Valor final" value={money.format(finalValue)} detail="Total a receber" />
          <Metric title="Lucro do salão" value={money.format(salonValue)} detail="Valor líquido" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Desconto" type="number" min="0" value={discount} onChange={setDiscount} />
          <Field label="Observação" value={notes} onChange={setNotes} />
        </div>
        <fieldset className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <legend className="px-1 text-sm font-semibold text-gray-600 dark:text-gray-300">Forma de pagamento</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {paymentMethodOptions.map((option, index) => {
              const value = paymentMethodValues[index]
              const selected = paymentMethod === value
              return (
                <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-bold transition ${selected ? 'border-graphite bg-graphite text-white dark:border-lilacSoft dark:bg-lilacSoft dark:text-graphite' : 'border-gray-100 bg-white text-graphite hover:bg-pearl dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100 dark:hover:bg-white/10'}`}>
                  <input type="radio" name="paymentMethod" checked={selected} onChange={() => setPaymentMethod(value)} className="h-4 w-4 accent-[#c9a85d]" />
                  <span>{option}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
          <button type="button" onClick={() => onConfirm(appointment, 'pendente', { discount: safeDiscount, notes })} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
            Manter pendente
          </button>
          <button className={`${paymentStatus === 'pago' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'} focus-ring inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition`}>
            {paymentStatus === 'pago' ? 'Marcar como pago' : 'Pendente / pagar depois'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CashEntryModal({ onClose, onSave }) {
  const [form, setForm] = useState({ type: 'Entrada', description: '', category: 'Operacional', paymentMethod: 'Pix', value: 0, date: todayIso })
  const ownerWithdrawal = form.type === 'Retirada do dono'
  const cashOut = ownerWithdrawal || form.type === 'Sangria' || form.type === 'Saída' || form.type === 'Saida'
  return (
    <Modal title="Nova movimentação" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Select label="Tipo" value={form.type} onChange={(value) => setForm({ ...form, type: value, category: value === 'Retirada do dono' ? 'retirada_dono' : value === 'Sangria' ? 'sangria' : form.category })} options={['Entrada', 'Saída', 'Sangria', 'Retirada do dono']} />
        {ownerWithdrawal && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
            A retirada do dono sera registrada como saida e reduzira o resultado do dia do caixa.
          </div>
        )}
        <Field label="Descrição" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
        <Field label="Categoria" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Forma de pagamento" value={form.paymentMethod} onChange={(value) => setForm({ ...form, paymentMethod: value })} options={cashOut ? ['Dinheiro', 'Pix', 'Outro'] : ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Pendente']} />
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

function Advances({ salonId, user, employees, advances, setAdvances, setCashEntries, setAuditLogs, notify }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [discountTarget, setDiscountTarget] = useState(null)
  const [filters, setFilters] = useState({ employeeId: 'all', date: '', status: 'all' })
  const canAccess = user.role === 'admin' || user.role === 'cashier'
  const canDelete = user.role === 'admin'

  if (!canAccess) return <AccessDenied />

  const filteredAdvances = advances.filter((item) => (
    (filters.employeeId === 'all' || String(advanceEmployeeId(item) ?? '') === filters.employeeId) &&
    (!filters.date || advanceCreatedDate(item) === filters.date) &&
    (filters.status === 'all' || advanceStatus(item) === filters.status)
  ))

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setModalOpen(true)
  }

  async function saveAdvance(data) {
    const employee = employees.find((item) => String(item.id) === String(data.employeeId)) ?? employees.find((item) => item.name === data.employeeName)
    const status = normalizeAdvanceStatus(data.status)
    const cancelledAt = status === 'cancelado'
      ? (data.cancelledAt ?? advanceCancelledAt(editing) ?? new Date().toISOString())
      : null
    const payload = {
      employeeId: employee?.id ?? data.employeeId ?? null,
      employee_id: employee?.id ?? data.employeeId ?? null,
      employeeName: employee?.name ?? data.employeeName ?? '',
      employee_name: employee?.name ?? data.employeeName ?? '',
      amount: Number(data.value) || Number(data.amount) || 0,
      status,
      createdAt: data.createdAt,
      created_at: data.createdAt,
      cancelledAt,
      cancelled_at: cancelledAt,
      cancelledReason: status === 'cancelado' ? data.reason ?? data.cancelledReason ?? data.cancelled_reason ?? '' : '',
      cancelled_reason: status === 'cancelado' ? data.reason ?? data.cancelledReason ?? data.cancelled_reason ?? '' : '',
      notes: data.notes ?? ''
    }
    if (!payload.employeeName || payload.amount <= 0 || !payload.createdAt) {
      notify?.('Erro ao salvar: confira Funcionário, valor, data e motivo.', 'error')
      return
    }
    if (editing && !String(data.reason ?? '').trim()) {
      notify?.('Informe o motivo da alteração.', 'error')
      return
    }
    try {
    if (editing) {
      const updatedAdvance = normalizeAdvanceRecord(await updateAdvanceRecord(salonId, editing.id, payload))
      await recordAuditLog({
        salonId,
        user,
        action: advanceStatus(editing) !== 'cancelado' && advanceStatus(updatedAdvance) === 'cancelado' ? 'cancelamento_vale' : 'edicao_vale',
        entityType: 'advance',
        entityId: editing.id,
        oldData: editing,
        newData: updatedAdvance,
        reason: data.reason,
        onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
      })
      setAdvances((current) => current.map((item) => item.id === editing.id ? updatedAdvance : item))
      setCashEntries((current) => {
        if (!isValidAdvance(updatedAdvance)) {
          return current.filter((entry) => String(entry.id) !== String(`advance-${editing.id}`))
        }
        const exists = current.some((entry) => String(entry.id) === String(`advance-${editing.id}`))
        if (!exists) return [...current, createAdvanceCashEntry(updatedAdvance)]
        return current.map((entry) => (
          String(entry.id) === String(`advance-${editing.id}`)
            ? { ...entry, ...createAdvanceCashEntry(updatedAdvance), id: entry.id }
            : entry
        ))
      })
      notify?.('Vale atualizado.')
    } else {
      const newAdvance = normalizeAdvanceRecord(await createAdvanceRecord(salonId, payload))
      setAdvances((current) => [...current, newAdvance])
      if (isValidAdvance(newAdvance)) {
        setCashEntries((current) => [...current, createAdvanceCashEntry(newAdvance)])
      }
      notify?.(isValidAdvance(newAdvance) ? 'Vale criado e lançado no caixa.' : 'Vale criado.')
    }
    setModalOpen(false)
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  async function markDiscounted(item, reason) {
    if (!String(reason ?? '').trim()) {
      notify?.('Informe o motivo da alteração.', 'error')
      return
    }
    const discountedAt = new Date().toISOString()
    try {
      const updatedAdvance = normalizeAdvanceRecord(await updateAdvanceRecord(salonId, item.id, { status: 'descontado', discountedAt, discounted_at: discountedAt }))
      await recordAuditLog({
        salonId,
        user,
        action: 'edicao_vale',
        entityType: 'advance',
        entityId: item.id,
        oldData: item,
        newData: updatedAdvance,
        reason,
        onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
      })
      setAdvances((current) => current.map((advance) => advance.id === item.id ? updatedAdvance : advance))
      notify?.('Vale marcado como descontado.')
      setDiscountTarget(null)
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  async function removeAdvance(item, reason) {
    if (!String(reason ?? '').trim()) {
      notify?.('Informe o motivo do cancelamento.', 'error')
      return
    }
    try {
    const cancelledAt = new Date().toISOString()
    const updatedAdvance = normalizeAdvanceRecord(await updateAdvanceRecord(salonId, item.id, { status: 'cancelado', cancelledAt, cancelled_at: cancelledAt, cancelledReason: reason, cancelled_reason: reason }))
    await recordAuditLog({
      salonId,
      user,
      action: 'cancelamento_vale',
      entityType: 'advance',
      entityId: item.id,
      oldData: item,
      newData: updatedAdvance,
      reason,
      onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
    })
    setAdvances((current) => current.map((advance) => advance.id === item.id ? updatedAdvance : advance))
    setCashEntries((current) => current.filter((entry) => String(entry.id) !== String(`advance-${item.id}`)))
    setCancelTarget(null)
    notify?.('Vale excluído.')
    } catch (error) {
      handleDataActionError(error, notify)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">{uiText.advances.title}</h3>
          <p className="text-sm text-gray-500">{uiText.advances.subtitle}</p>
        </div>
        <button onClick={openNew} className={`${buttonPrimary} rounded-2xl px-4 py-3`}>{uiText.advances.newAdvance}</button>
      </div>

      <Panel title="Filtros">
        <div className="grid gap-3 md:grid-cols-3">
          <Select label="Funcionário" value={filters.employeeId} onChange={(value) => setFilters({ ...filters, employeeId: value })} options={['Todos', ...employees.map((item) => item.name)]} values={['all', ...employees.map((item) => String(item.id))]} />
          <Field label="Data" type="date" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} />
          <Select label="Status" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={['Todos', 'Pendente', 'Descontado', 'Cancelado']} values={['all', 'pendente', 'descontado', 'cancelado']} />
        </div>
      </Panel>

      <CardsGrid items={filteredAdvances} render={(item) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{advanceEmployeeName(item)}</p>
              <p className="mt-1 text-sm text-gray-500">{formatDate(advanceCreatedDate(item))}</p>
            </div>
            <StatusBadge tone={advanceStatusTone(item)}>{advanceStatusLabel(item)}</StatusBadge>
          </div>
          <p className="mt-4 text-2xl font-bold text-graphite dark:text-gray-100">{money.format(advanceValue(item))}</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{uiText.advances.notes}: {item.notes || '-'}</p>
          {advanceDiscountedDate(item) && <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Descontado em {formatDate(advanceDiscountedDate(item))}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => openEdit(item)} className={buttonSecondary}>{uiText.common.edit}</button>
            {advanceStatus(item) === 'pendente' && <button onClick={() => setDiscountTarget(item)} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Marcar descontado</button>}
            {canDelete && advanceStatus(item) !== 'cancelado' && <button onClick={() => setCancelTarget(item)} className={buttonDanger}>Cancelar</button>}
          </div>
        </>
      )} />

      {filteredAdvances.length === 0 && (
        <Panel title="Resultado">
          <p className="text-sm font-semibold text-gray-500">Nenhum resultado encontrado para os filtros selecionados.</p>
        </Panel>
      )}

      {modalOpen && <AdvanceModal employees={employees} advance={editing} onClose={() => setModalOpen(false)} onSave={saveAdvance} />}
      {cancelTarget && (
        <ReasonModal
          title="Cancelar vale"
          description={`Informe o motivo para cancelar o vale de ${advanceEmployeeName(cancelTarget)}.`}
          confirmLabel="Cancelar vale"
          danger
          onClose={() => setCancelTarget(null)}
          onConfirm={(reason) => removeAdvance(cancelTarget, reason)}
        />
      )}
      {discountTarget && (
        <ReasonModal
          title="Marcar vale como descontado"
          description={`Informe o motivo para descontar o vale de ${advanceEmployeeName(discountTarget)}.`}
          confirmLabel="Marcar descontado"
          onClose={() => setDiscountTarget(null)}
          onConfirm={(reason) => markDiscounted(discountTarget, reason)}
        />
      )}
    </div>
  )
}

function AdvanceModal({ employees, advance, onClose, onSave }) {
  const [form, setForm] = useState(advance ? {
    employeeId: advanceEmployeeId(advance) ?? '',
    employeeName: advanceEmployeeName(advance),
    value: advanceValue(advance),
    createdAt: advanceCreatedDate(advance),
    status: advanceStatus(advance),
    notes: advance.notes ?? '',
    reason: ''
  } : { employeeId: employees[0]?.id ?? '', employeeName: employees[0]?.name ?? '', value: 0, createdAt: todayIso, status: 'pendente', notes: '' })

  return (
    <Modal title={advance ? 'Editar vale' : uiText.advances.newAdvance} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Select label="Profissional" value={form.employeeId} onChange={(value) => setForm({ ...form, employeeId: value, employeeName: employees.find((item) => String(item.id) === String(value))?.name ?? '' })} options={employees.map((item) => item.name)} values={employees.map((item) => String(item.id))} />
        <Field label={uiText.advances.value} type="number" min="0.01" value={form.value} onChange={(value) => setForm({ ...form, value })} required />
        <Field label="Criado em" type="date" value={form.createdAt} onChange={(value) => setForm({ ...form, createdAt: value })} required />
        <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={["Pendente", "Descontado", "Cancelado"]} values={["pendente", "descontado", "cancelado"]} />
        <Field label={uiText.advances.notes} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        {advance && (
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Motivo da alteração</span>
            <textarea className={`${inputBase} min-h-24`} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required />
          </label>
        )}
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

function auditActionLabel(action) {
  const labels = {
    edicao_vale: 'Edição de vale',
    cancelamento_vale: 'Cancelamento de vale',
    edicao_lancamento_financeiro: 'Edição de lançamento financeiro',
    cancelamento_lancamento_financeiro: 'Cancelamento de lançamento financeiro',
    pagamento_comissao: 'Pagamento de comissão',
    fechamento_caixa: 'Fechamento de caixa',
    retirada_dono: 'Retirada do dono'
  }
  return labels[action] ?? action
}

function auditEntityLabel(type) {
  const labels = {
    advance: 'Vale',
    cash_movement: 'Lançamento financeiro',
    commission_payment: 'Pagamento de comissão',
    cash_closure: 'Fechamento de caixa'
  }
  return labels[type] ?? type
}

function formatAuditDate(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('pt-BR')
}

function AuditTrail({ auditLogs = [] }) {
  const [selectedLog, setSelectedLog] = useState(null)
  const rows = [...auditLogs].sort((a, b) => String(b.createdAt ?? b.created_at ?? '').localeCompare(String(a.createdAt ?? a.created_at ?? '')))
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#d9c17a]/70 bg-white p-5 shadow-soft dark:border-[#d9c17a]/30 dark:bg-[#1f1b26]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c9a85d]">{uiText.audit.title}</p>
            <h2 className="mt-1 text-2xl font-black text-graphite dark:text-gray-100">{uiText.audit.title}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">{uiText.audit.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled className="focus-ring rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-400 dark:border-white/10 dark:bg-[#24202c]">Exportar PDF</button>
            <button type="button" disabled className="focus-ring rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-400 dark:border-white/10 dark:bg-[#24202c]">Exportar Excel</button>
          </div>
        </div>
      </section>
      <Panel title="Histórico de auditoria">
        {rows.length ? (
          <Table
            rows={rows}
            columns={['createdAt', 'userName', 'action', 'entityType', 'reason', 'details']}
            labels={['Data', 'Usuário', 'Ação', 'Tipo', 'Motivo', 'Ver detalhes']}
            formatValue={(key, value, row) => {
              if (key === 'createdAt') return formatAuditDate(row.createdAt ?? row.created_at)
              if (key === 'userName') return row.userName || row.user_name || '-'
              if (key === 'action') return <StatusBadge tone="cyan">{auditActionLabel(row.action)}</StatusBadge>
              if (key === 'entityType') return auditEntityLabel(row.entityType ?? row.entity_type)
              if (key === 'reason') return row.reason || '-'
              if (key === 'details') return <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedLog(row) }} className={buttonSecondary}>{uiText.audit.details}</button>
              return value
            }}
          />
        ) : (
          <EmptyState>Nenhum registro de auditoria encontrado.</EmptyState>
        )}
      </Panel>
      {selectedLog && <AuditDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  )
}

function AuditDetailsModal({ log, onClose }) {
  const oldData = log.oldData ?? log.old_data
  const newData = log.newData ?? log.new_data
  return (
    <Modal title="Detalhes da auditoria" onClose={onClose} maxWidth="max-w-5xl" zClass="z-50">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric title="Ação" value={auditActionLabel(log.action)} detail={auditEntityLabel(log.entityType ?? log.entity_type)} />
          <Metric title="Usuário" value={log.userName || log.user_name || '-'} detail={formatAuditDate(log.createdAt ?? log.created_at)} />
          <Metric title={uiText.audit.reason} value={log.reason || '-'} detail={`ID ${log.entityId ?? log.entity_id ?? '-'}`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AuditJsonBlock title={uiText.audit.before} data={oldData} />
          <AuditJsonBlock title={uiText.audit.after} data={newData} />
        </div>
      </div>
    </Modal>
  )
}

function AuditJsonBlock({ title, data }) {
  return (
    <div className="min-w-0 rounded-2xl border border-gray-100 bg-pearl p-4 dark:border-white/10 dark:bg-white/5">
      <p className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{title}</p>
      <pre className="simple-scrollbar max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-xs font-semibold text-gray-700 dark:bg-[#17141c] dark:text-gray-200">
        {data ? JSON.stringify(toFriendlyAuditData(data), null, 2) : uiText.reports.noData}
      </pre>
    </div>
  )
}

function toFriendlyAuditData(data) {
  const labels = {
    cash_movements: 'Lançamentos financeiros',
    cash_movement: 'Lançamento financeiro',
    payment_status: 'Status do pagamento',
    payment_method: 'Forma de pagamento',
    employee_id: 'profissional',
    service_value: 'Valor do serviço',
    commission_value: 'Comissão',
    salon_value: 'Lucro do salão',
    employee_name: 'profissional',
    service_name: 'serviço',
    client_name: 'cliente',
    created_at: 'criado em',
    updated_at: 'atualizado em',
    cancelled_at: 'cancelado em'
  }
  const values = {
    service_value: 'Valor do serviço',
    commission_value: 'Comissão',
    salon_value: 'Lucro do salão',
    cash_movements: 'Lançamentos financeiros',
    payment_method: 'Forma de pagamento',
    payment_status: 'Status do pagamento'
  }
  if (Array.isArray(data)) return data.map(toFriendlyAuditData)
  if (!data || typeof data !== 'object') return data
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [
    labels[key] ?? key,
    typeof value === 'string' ? values[value] ?? value : toFriendlyAuditData(value)
  ]))
}

function Reports({ salonId, appointments, employees, cashEntries = [], setCashEntries, advances = [], setAdvances, commissionPayments = [], setCommissionPayments, user, salonSettings, setAuditLogs, notify }) {
  const [employeeResultPeriod, setEmployeeResultPeriod] = useState('semana')
  const [employeeResultStartDate, setEmployeeResultStartDate] = useState(todayIso)
  const [selectedReportEmployee, setSelectedReportEmployee] = useState('todos')
  const [exporting, setExporting] = useState(null)
  const reportData = buildFinancialReportData({
    cashEntries,
    advances,
    employees,
    periodType: employeeResultPeriod,
    startDate: employeeResultStartDate,
    selectedEmployeeId: selectedReportEmployee
  })
  const appointmentEntries = reportData.appointmentEntries
  const completed = appointmentEntries
  const pendingReportEntries = reportData.pendingEntries
  const commissions = reportData.totals.commission
  const employeeCommissions = reportData.employeeRows.map((item) => ({ name: item.employeeName, value: item.commission, count: item.appointments }))
  const serviceCommissions = topEntries(appointmentEntries.reduce((acc, item) => ({ ...acc, [cashServiceName(item) || 'Serviço']: (acc[cashServiceName(item) || 'Serviço'] || 0) + cashCommissionValue(item) }), {}), 8)
  const serviceSales = topEntries(countBy(appointmentEntries, (item) => cashServiceName(item) || 'Serviço'))
  const frequentClients = topEntries(countBy(appointmentEntries, (item) => cashClientName(item) || 'Cliente'), 5)
  const revenue = reportData.totals.revenue

  async function exportReport(format) {
    setExporting(format)
    try {
      if (format === 'pdf') await exportReportsPdf(reportData, salonSettings)
      if (format === 'excel') await exportReportsExcel(reportData, salonSettings)
      notify?.(format === 'pdf' ? 'PDF exportado.' : 'Excel exportado.')
    } catch (error) {
      console.error('Erro ao exportar relatório:', error)
      notify?.('Não foi possível exportar o relatório.', 'error')
    } finally {
      setExporting(null)
    }
  }
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#d9c17a]/70 bg-white p-5 shadow-soft dark:border-[#d9c17a]/30 dark:bg-[#1f1b26]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c9a85d]">{uiText.reports.title}</p>
            <h2 className="mt-1 text-2xl font-black text-graphite dark:text-gray-100">{uiText.reports.exports}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">{uiText.reports.exportHelp}</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[560px]">
            <Select
              label="Funcionário"
              value={selectedReportEmployee}
              onChange={setSelectedReportEmployee}
              options={['Todos', ...employees.map((item) => item.name)]}
              values={['todos', ...employees.map((item) => String(item.id))]}
            />
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => exportReport('pdf')} disabled={Boolean(exporting)} className="focus-ring min-h-12 flex-1 rounded-2xl border border-[#d9c17a] bg-[#fff8e1] px-4 py-3 text-sm font-black text-[#6f5612] shadow-sm transition hover:bg-[#ffefb0] disabled:opacity-70 dark:border-[#d9c17a]/40 dark:bg-[#3a311f] dark:text-[#ffe6a1]">
                {exporting === 'pdf' ? 'Exportando...' : 'Exportar PDF'}
              </button>
              <button type="button" onClick={() => exportReport('excel')} disabled={Boolean(exporting)} className="focus-ring min-h-12 flex-1 rounded-2xl bg-graphite px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#343039] disabled:opacity-70 dark:bg-lilacSoft dark:text-graphite">
                {exporting === 'excel' ? 'Exportando...' : 'Exportar Excel'}
              </button>
            </div>
          </div>
        </div>
      </section>
      {user.role === 'admin' && (
        <EmployeeResultsReport
          salonId={salonId}
          cashEntries={cashEntries}
          setCashEntries={setCashEntries}
          advances={advances}
          setAdvances={setAdvances}
          employees={employees}
          periodType={employeeResultPeriod}
          startDate={employeeResultStartDate}
          selectedEmployeeId={selectedReportEmployee}
          onPeriodTypeChange={setEmployeeResultPeriod}
          onStartDateChange={setEmployeeResultStartDate}
          onSelectedEmployeeChange={setSelectedReportEmployee}
          setCommissionPayments={setCommissionPayments}
          user={user}
          setAuditLogs={setAuditLogs}
          notify={notify}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-2">
      {user.role === 'admin' && <Panel title="Faturamento por período"><CompactList items={[`Mês atual: ${money.format(revenue)}`, `Ticket médio: ${money.format(completed.length ? revenue / completed.length : 0)}`]} /></Panel>}
      <Panel title={user.role === 'admin' ? 'Comissões gerais' : 'Minha Comissão'}><CompactList items={[money.format(commissions)]} /></Panel>
      <Panel title={uiText.dashboard.commissionByProfessional}><CompactList items={employeeCommissions.length ? employeeCommissions.map((item) => `${item.name}: ${money.format(item.value)}`) : [uiText.reports.noCommission]} /></Panel>
      <Panel title="Vales descontados"><CompactList items={[money.format(reportData.totals.advancesDiscounted)]} /></Panel>
      <Panel title="Adiantamentos pendentes"><CompactList items={[money.format(reportData.totals.advancesPending)]} /></Panel>
      <Panel title="Saldo líquido a pagar"><CompactList items={[money.format(reportData.totals.netCommission)]} /></Panel>
      <Panel title={uiText.dashboard.commissionByService}><CompactList items={serviceCommissions.length ? serviceCommissions.map(([label, value]) => `${label}: ${money.format(value)}`) : [uiText.reports.noCommission]} /></Panel>
      <Panel title="Serviços mais vendidos"><CompactList items={serviceSales.length ? serviceSales.map(([label, count]) => `${label}: ${count}`) : [uiText.reports.noData]} /></Panel>
      <Panel title="Clientes mais frequentes"><CompactList items={frequentClients.length ? frequentClients.map(([label, count]) => `${label}: ${count}`) : [uiText.reports.noData]} /></Panel>
      {user.role === 'admin' && <Panel title="Pagamentos pendentes"><CompactList items={pendingReportEntries.length ? pendingReportEntries.map((item) => `${cashClientName(item) || cashDescription(item)}: ${money.format(cashServiceValue(item))}`) : ['Nenhum pagamento registrado neste período.']} /></Panel>}
      </div>
      <Panel title="Vales por funcionário">
        <Table
          rows={reportData.employeeRows.filter((row) => row.advancesTotal > 0 || row.commission > 0)}
          columns={['employeeName', 'advancesTotal', 'advancesPending', 'advancesDiscounted', 'netCommission']}
          labels={['Funcionário', 'Total de vales no período', 'Vales pendentes', 'Vales descontados', 'Saldo líquido da comissão']}
          formatValue={(key, value) => key === 'employeeName' ? value : money.format(Number(value) || 0)}
        />
      </Panel>
      <CommissionPaymentHistory payments={commissionPayments} />
    </div>
  )
}

function CommissionPaymentHistory({ payments = [] }) {
  const rows = [...payments].sort((a, b) => String(b.paidAt ?? b.paid_at ?? '').localeCompare(String(a.paidAt ?? a.paid_at ?? '')))
  return (
    <Panel title={uiText.reports.commissionHistory}>
      {rows.length ? (
        <Table
          rows={rows}
          columns={['paidAt', 'employeeName', 'commissionGross', 'advancesTotal', 'amount', 'paymentMethod', 'notes', 'period']}
          labels={['Data do pagamento', 'Funcionário', 'Comissão bruta', 'Vales descontados', 'Valor líquido pago', 'Forma de pagamento', 'Observação', 'Período referente']}
          formatValue={(key, value, row) => {
            if (key === 'paidAt') return formatDate(String(row.paidAt ?? row.paid_at ?? '').slice(0, 10))
            if (key === 'employeeName') return row.employeeName || row.employee_name || '-'
            if (key === 'commissionGross') return money.format(Number(row.commissionGross ?? row.commission_gross ?? row.amount) || 0)
            if (key === 'advancesTotal') return money.format(Number(row.advancesTotal ?? row.advances_total) || 0)
            if (key === 'amount') return money.format(Number(row.amount) || 0)
            if (key === 'paymentMethod') return <StatusBadge tone="cyan">{financialPaymentMethodLabel(row.paymentMethod ?? row.payment_method)}</StatusBadge>
            if (key === 'period') return `${formatDate(row.periodStart ?? row.period_start)} até ${formatDate(row.periodEnd ?? row.period_end)}`
            return value || '-'
          }}
        />
      ) : (
        <EmptyState>Nenhum pagamento de comissão registrado neste período.</EmptyState>
      )}
    </Panel>
  )
}

function buildFinancialReportData({ cashEntries = [], advances = [], employees = [], periodType = 'semana', startDate = todayIso, selectedEmployeeId = 'todos' }) {
  const endDate = getPeriodEndDate(startDate, periodType)
  const startDateTime = parseDateStart(startDate)
  const endDateTime = parseDateEnd(endDate)
  const employeeFilter = String(selectedEmployeeId ?? 'todos')
  const selectedEmployee = employees.find((item) => String(item.id) === employeeFilter)
  const inPeriod = (entry) => {
    const entryDate = parseDateStart(cashDate(entry))
    return entryDate && startDateTime && endDateTime && entryDate >= startDateTime && entryDate <= endDateTime
  }
  const matchesEmployee = (entry) => employeeFilter === 'todos' ||
    String(field(entry, 'employeeId', 'employee_id') ?? '') === employeeFilter ||
    (selectedEmployee?.name && cashEmployeeName(entry) === selectedEmployee.name)
  const matchesAdvanceEmployee = (advance) => employeeFilter === 'todos' ||
    String(advanceEmployeeId(advance) ?? '') === employeeFilter ||
    (selectedEmployee?.name && advanceEmployeeName(advance) === selectedEmployee.name)
  const periodEntries = (cashEntries || []).filter((entry) => isActiveCashEntry(entry) && inPeriod(entry) && matchesEmployee(entry))
  const appointmentEntries = periodEntries.filter((entry) => isAppointmentCashEntry(entry) && isPaidIncomeCashEntry(entry))
  const pendingEntries = periodEntries.filter(isPendingIncomeCashEntry)
  const periodAdvances = (advances || []).filter((advance) => isValidAdvance(advance) && advanceInPeriod(advance, startDate, endDate) && matchesAdvanceEmployee(advance))
  const employeeRows = Object.values(appointmentEntries.reduce((acc, entry) => {
    const employeeId = field(entry, 'employeeId', 'employee_id')
    const key = employeeId ? String(employeeId) : `name:${cashEmployeeName(entry) || 'sem-funcionario'}`
    const employee = employees.find((item) => String(item.id) === String(employeeId) || item.name === cashEmployeeName(entry))
    acc[key] = acc[key] ?? {
      id: key,
      employeeId: employeeId ? String(employeeId) : '',
      employeeName: employee?.name ?? cashEmployeeName(entry) ?? 'Funcionário',
      appointments: 0,
      revenue: 0,
      commission: 0,
      commissionPaid: 0,
      commissionPending: 0,
      advancesTotal: 0,
      advancesPending: 0,
      advancesDiscounted: 0,
      netCommission: 0,
      salonProfit: 0,
      entries: []
    }
    const commissionValue = cashCommissionValue(entry)
    acc[key].appointments += 1
    acc[key].revenue += cashServiceValue(entry)
    acc[key].commission += commissionValue
    acc[key].commissionPaid += cashCommissionPaid(entry) ? commissionValue : 0
    acc[key].commissionPending += cashCommissionPaid(entry) ? 0 : commissionValue
    acc[key].salonProfit += cashSalonValue(entry)
    acc[key].entries.push(entry)
    return acc
  }, {})).sort((a, b) => b.revenue - a.revenue)
  periodAdvances.forEach((advance) => {
    const employeeId = advanceEmployeeId(advance)
    const key = employeeId ? String(employeeId) : `name:${advanceEmployeeName(advance) || 'sem-funcionario'}`
    const employee = employees.find((item) => String(item.id) === String(employeeId) || item.name === advanceEmployeeName(advance))
    let row = employeeRows.find((item) => item.id === key)
    if (!row) {
      row = { id: key, employeeId: employeeId ? String(employeeId) : '', employeeName: employee?.name ?? advanceEmployeeName(advance) ?? 'Funcionario', appointments: 0, revenue: 0, commission: 0, commissionPaid: 0, commissionPending: 0, advancesTotal: 0, advancesPending: 0, advancesDiscounted: 0, netCommission: 0, salonProfit: 0, entries: [] }
      employeeRows.push(row)
    }
    row.advancesTotal += advanceValue(advance)
    if (advanceStatus(advance) === 'pendente') row.advancesPending += advanceValue(advance)
    if (advanceStatus(advance) === 'descontado') row.advancesDiscounted += advanceValue(advance)
  })
  employeeRows.forEach((row) => {
    row.netCommission = row.commission - row.advancesPending - row.advancesDiscounted
  })
  const totals = employeeRows.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue,
    commission: acc.commission + row.commission,
    commissionPaid: acc.commissionPaid + row.commissionPaid,
    commissionPending: acc.commissionPending + row.commissionPending,
    advancesTotal: acc.advancesTotal + row.advancesTotal,
    advancesPending: acc.advancesPending + row.advancesPending,
    advancesDiscounted: acc.advancesDiscounted + row.advancesDiscounted,
    netCommission: acc.netCommission + row.netCommission,
    salonProfit: acc.salonProfit + row.salonProfit,
    appointments: acc.appointments + row.appointments
  }), { revenue: 0, commission: 0, commissionPaid: 0, commissionPending: 0, advancesTotal: 0, advancesPending: 0, advancesDiscounted: 0, netCommission: 0, salonProfit: 0, appointments: 0 })

  return {
    startDate,
    endDate,
    periodType,
    selectedEmployeeId: employeeFilter,
    selectedEmployeeName: employeeFilter === 'todos' ? 'Todos' : selectedEmployee?.name ?? 'Funcionário',
    periodEntries,
    appointmentEntries,
    pendingEntries,
    periodAdvances,
    employeeRows,
    totals
  }
}

function reportPeriodLabel(reportData) {
  return `${formatDate(reportData.startDate)} até ${formatDate(reportData.endDate)}`
}

function reportMoney(value) {
  return money.format(Number(value) || 0)
}

function movementExportRows(entries) {
  return (entries || []).map((entry) => ({
    Data: formatDate(cashDate(entry)),
    Tipo: cashType(entry),
    Cliente: cashClientName(entry) || cashDescription(entry),
    'Servico': cashServiceName(entry) || cashCategory(entry),
    'Funcionario': cashEmployeeName(entry),
    Forma: paymentMethodLabel(cashMethod(entry)),
    Status: cashStatus(entry),
    Valor: cashServiceValue(entry),
    'Comissao': cashCommissionValue(entry),
    'Salao': cashSalonValue(entry),
    'Comissão paga': cashCommissionPaid(entry) ? 'Sim' : 'Não',
    'Pago em': cashCommissionPaidAt(entry) ? formatDate(String(cashCommissionPaidAt(entry)).slice(0, 10)) : ''
  }))
}

function employeeExportRows(rows) {
  return (rows || []).map((row) => ({
    'Funcionario': row.employeeName,
    Atendimentos: row.appointments,
    Faturamento: row.revenue,
    'Comissão total': row.commission,
    'Comissão paga': row.commissionPaid,
    'Comissão pendente': row.commissionPending,
    'Lucro do salão': row.salonProfit
  }))
}

async function exportReportsPdf(reportData, salonSettings) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ])
  const autoTable = autoTableModule.default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const salonName = salonSettings?.salonName || 'Salão'
  doc.setFontSize(16)
  doc.text(salonName, 40, 36)
  doc.setFontSize(10)
  doc.text(`Período analisado: ${reportPeriodLabel(reportData)}`, 40, 54)
  doc.text(`Funcionário: ${reportData.selectedEmployeeName}`, 40, 70)

  autoTable(doc, {
    startY: 88,
    head: [['Total faturado', 'Total de comissões', 'Lucro do salão', 'Comissão paga', 'Comissão pendente']],
    body: [[
      reportMoney(reportData.totals.revenue),
      reportMoney(reportData.totals.commission),
      reportMoney(reportData.totals.salonProfit),
      reportMoney(reportData.totals.commissionPaid),
      reportMoney(reportData.totals.commissionPending)
    ]],
    styles: { fontSize: 9 }
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [['Funcionário', 'Atendimentos', 'Faturamento', 'Comissão', 'Pago', 'Pendente', 'Lucro do salão']],
    body: reportData.employeeRows.length ? reportData.employeeRows.map((row) => [
      row.employeeName,
      row.appointments,
      reportMoney(row.revenue),
      reportMoney(row.commission),
      reportMoney(row.commissionPaid),
      reportMoney(row.commissionPending),
      reportMoney(row.salonProfit)
    ]) : [[uiText.reports.noData, '-', '-', '-', '-', '-', '-']],
    styles: { fontSize: 8 }
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [['Pagamentos pendentes', 'Serviço', 'Funcionário', 'Valor']],
    body: reportData.pendingEntries.length ? reportData.pendingEntries.map((entry) => [
      cashClientName(entry) || cashDescription(entry),
      cashServiceName(entry) || cashCategory(entry),
      cashEmployeeName(entry),
      reportMoney(cashServiceValue(entry))
    ]) : [['Sem pagamentos pendentes', '-', '-', '-']],
    styles: { fontSize: 8 }
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [['Data', 'Cliente', 'Serviço', 'Funcionário', 'Forma', 'Status', 'Valor', 'Comissão', 'Salão']],
    body: reportData.periodEntries.length ? reportData.periodEntries.map((entry) => [
      formatDate(cashDate(entry)),
      cashClientName(entry) || cashDescription(entry),
      cashServiceName(entry) || cashCategory(entry),
      cashEmployeeName(entry),
      paymentMethodLabel(cashMethod(entry)),
      cashStatus(entry),
      reportMoney(cashServiceValue(entry)),
      reportMoney(cashCommissionValue(entry)),
      reportMoney(cashSalonValue(entry))
    ]) : [['Sem movimentações', '-', '-', '-', '-', '-', '-', '-', '-']],
    styles: { fontSize: 7 }
  })

  doc.save(`relatorio-financeiro-${reportData.startDate}-${reportData.endDate}.pdf`)
}

async function exportReportsExcel(reportData, salonSettings) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const summaryRows = [
    { Indicador: 'Salão', Valor: salonSettings?.salonName || 'Salão' },
    { Indicador: 'Período', Valor: reportPeriodLabel(reportData) },
    { Indicador: 'Funcionário', Valor: reportData.selectedEmployeeName },
    { Indicador: 'Total faturado', Valor: reportData.totals.revenue },
    { Indicador: 'Total de comissões', Valor: reportData.totals.commission },
    { Indicador: 'Lucro do salão', Valor: reportData.totals.salonProfit },
    { Indicador: 'Comissão paga', Valor: reportData.totals.commissionPaid },
    { Indicador: 'Comissão pendente', Valor: reportData.totals.commissionPending }
  ]
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumo')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(employeeExportRows(reportData.employeeRows)), 'Funcionários')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(employeeExportRows(reportData.employeeRows).map((row) => ({
    'Funcionario': row.Funcionario,
    'Comissão total': row['Comissão total'],
    'Comissão paga': row['Comissão paga'],
    'Comissão pendente': row['Comissão pendente']
  }))), 'Comissões')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movementExportRows(reportData.periodEntries)), 'Movimentações')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movementExportRows(reportData.pendingEntries)), 'Pendentes')
  XLSX.writeFile(workbook, `relatorio-financeiro-${reportData.startDate}-${reportData.endDate}.xlsx`)
}

function EmployeeResultsReport({ salonId, cashEntries, setCashEntries, advances = [], setAdvances, employees, periodType, startDate, selectedEmployeeId, onPeriodTypeChange, onStartDateChange, onSelectedEmployeeChange, setCommissionPayments, user, setAuditLogs, notify }) {
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [commissionStatusFilter, setCommissionStatusFilter] = useState('todos')
  const [paymentEmployee, setPaymentEmployee] = useState(null)
  const endDate = getPeriodEndDate(startDate, periodType)
  const startDateTime = parseDateStart(startDate)
  const endDateTime = parseDateEnd(endDate)
  const selectedEmployeeFilter = employees.find((item) => String(item.id) === String(selectedEmployeeId ?? 'todos'))
  const resultEntries = (cashEntries || []).filter((entry) => {
    const entryDate = parseDateStart(cashDate(entry))
    return entryDate &&
      startDateTime &&
      endDateTime &&
      entryDate >= startDateTime &&
      entryDate <= endDateTime &&
      isPaidIncomeCashEntry(entry) &&
      (String(selectedEmployeeId ?? 'todos') === 'todos' ||
        String(field(entry, 'employeeId', 'employee_id') ?? '') === String(selectedEmployeeId) ||
        (selectedEmployeeFilter?.name && cashEmployeeName(entry) === selectedEmployeeFilter.name))
  })
  const rows = Object.values(resultEntries.reduce((acc, entry) => {
    const employeeId = field(entry, 'employeeId', 'employee_id')
    const key = employeeId ? String(employeeId) : `name:${cashEmployeeName(entry) || 'sem-funcionario'}`
    const employee = employees.find((item) => String(item.id) === String(employeeId) || item.name === cashEmployeeName(entry))
    acc[key] = acc[key] ?? {
      id: key,
      employeeId: key,
      employeeName: employee?.name ?? cashEmployeeName(entry) ?? 'Funcionário',
      appointments: 0,
      revenue: 0,
      commission: 0,
      commissionPaid: 0,
      commissionPending: 0,
      advancesTotal: 0,
      advancesPending: 0,
      advancesDiscounted: 0,
      netCommission: 0,
      entries: [],
      salonProfit: 0
    }
    const commissionValue = cashCommissionValue(entry)
    acc[key].appointments += 1
    acc[key].revenue += cashServiceValue(entry)
    acc[key].commission += commissionValue
    acc[key].commissionPaid += cashCommissionPaid(entry) ? commissionValue : 0
    acc[key].commissionPending += cashCommissionPaid(entry) ? 0 : commissionValue
    acc[key].entries.push(entry)
    acc[key].salonProfit += cashSalonValue(entry)
    return acc
  }, {})).sort((a, b) => b.revenue - a.revenue)
  const resultAdvances = (advances || []).filter((advance) => isValidAdvance(advance) && advanceInPeriod(advance, startDate, endDate) && (
    String(selectedEmployeeId ?? 'todos') === 'todos' ||
    String(advanceEmployeeId(advance) ?? '') === String(selectedEmployeeId) ||
    (selectedEmployeeFilter?.name && advanceEmployeeName(advance) === selectedEmployeeFilter.name)
  ))
  resultAdvances.forEach((advance) => {
    const employeeId = advanceEmployeeId(advance)
    const key = employeeId ? String(employeeId) : `name:${advanceEmployeeName(advance) || 'sem-funcionario'}`
    const employee = employees.find((item) => String(item.id) === String(employeeId) || item.name === advanceEmployeeName(advance))
    let row = rows.find((item) => item.id === key)
    if (!row) {
      row = { id: key, employeeId: employeeId ? String(employeeId) : '', employeeName: employee?.name ?? advanceEmployeeName(advance) ?? 'Funcionario', appointments: 0, revenue: 0, commission: 0, commissionPaid: 0, commissionPending: 0, advancesTotal: 0, advancesPending: 0, advancesDiscounted: 0, netCommission: 0, entries: [], salonProfit: 0 }
      rows.push(row)
    }
    row.advancesTotal += advanceValue(advance)
    if (advanceStatus(advance) === 'pendente') row.advancesPending += advanceValue(advance)
    if (advanceStatus(advance) === 'descontado') row.advancesDiscounted += advanceValue(advance)
  })
  rows.forEach((row) => {
    row.netCommission = row.commission - row.advancesPending - row.advancesDiscounted
  })
  const totals = rows.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue,
    commission: acc.commission + row.commission,
    commissionPaid: acc.commissionPaid + row.commissionPaid,
    commissionPending: acc.commissionPending + row.commissionPending,
    advancesTotal: acc.advancesTotal + row.advancesTotal,
    advancesPending: acc.advancesPending + row.advancesPending,
    advancesDiscounted: acc.advancesDiscounted + row.advancesDiscounted,
    netCommission: acc.netCommission + row.netCommission,
    salonProfit: acc.salonProfit + row.salonProfit,
    appointments: acc.appointments + row.appointments
  }), { revenue: 0, commission: 0, commissionPaid: 0, commissionPending: 0, advancesTotal: 0, advancesPending: 0, advancesDiscounted: 0, netCommission: 0, salonProfit: 0, appointments: 0 })
  const receivableRows = rows.filter((row) => {
    if (commissionStatusFilter === 'pendente') return row.commissionPending > 0
    if (commissionStatusFilter === 'paga') return row.commissionPending <= 0 && row.commissionPaid > 0
    return true
  })

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-blush/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26] sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-goldSoft">Lançamentos financeiros</p>
          <h3 className="mt-1 text-2xl font-bold text-graphite dark:text-gray-100">Resultado dos funcionários</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone="cyan">{formatDate(startDate)} até {formatDate(endDate)}</StatusBadge>
            <StatusBadge tone="green">{totals.appointments} atendimentos pagos</StatusBadge>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[640px] xl:grid-cols-3">
          <Select
            label="Tipo de período"
            value={periodType}
            onChange={onPeriodTypeChange}
            options={['Semana', 'Quinzena', 'Mês']}
            values={['semana', 'quinzena', 'mes']}
          />
          <Field label="Data inicial" type="date" value={startDate} onChange={onStartDateChange} />
          <Select
            label="Funcionário"
            value={selectedEmployeeId}
            onChange={onSelectedEmployeeChange}
            options={['Todos', ...employees.map((item) => item.name)]}
            values={['todos', ...employees.map((item) => String(item.id))]}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Total faturado</p>
          <p className="mt-2 text-2xl font-black text-graphite dark:text-gray-100">{money.format(totals.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Total de comissões</p>
          <p className="mt-2 text-2xl font-black text-graphite dark:text-gray-100">{money.format(totals.commission)}</p>
        </div>
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 dark:border-cyan-400/20 dark:bg-cyan-500/10">
          <p className="text-sm font-bold text-cyan-800 dark:text-cyan-200">Lucro do salão</p>
          <p className="mt-2 text-2xl font-black text-graphite dark:text-gray-100">{money.format(totals.salonProfit)}</p>
        </div>
      </div>

      <div className="mt-5">
        {rows.length ? (
          <Table
            rows={rows}
            columns={['employeeName', 'appointments', 'revenue', 'commission', 'salonProfit']}
            labels={['Funcionário', 'Atendimentos concluídos', 'Faturamento bruto', 'Comissão total', 'Valor líquido do salão']}
            onRowClick={(row) => setSelectedEmployee(row)}
            formatValue={(column, value) => {
              if (column === 'appointments') return <StatusBadge tone="gray">{value}</StatusBadge>
              if (column === 'revenue' || column === 'commission' || column === 'salonProfit') return money.format(value)
              return value
            }}
          />
        ) : (
          <EmptyState>Nenhum resultado encontrado para este período.</EmptyState>
        )}
      </div>
      <div className="mt-6 rounded-2xl border border-gray-100 bg-pearl/70 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-goldSoft">controle financeiro</p>
            <h4 className="mt-1 text-xl font-black text-graphite dark:text-gray-100">Valores a receber por funcionário</h4>
          </div>
          <div className="w-full sm:w-64">
            <Select
              label="Filtro"
              value={commissionStatusFilter}
              onChange={setCommissionStatusFilter}
              options={['Todos', 'Comissão pendente', 'Comissão paga']}
              values={['todos', 'pendente', 'paga']}
            />
          </div>
        </div>
        {receivableRows.length ? (
          <Table
            rows={receivableRows}
            columns={['employeeName', 'appointments', 'revenue', 'commission', 'advancesDiscounted', 'netCommission', 'commissionPaid', 'commissionPending', 'action']}
            labels={['Nome', 'Atendimentos concluídos', 'Faturamento gerado', 'Comissão total', 'Vales descontados', 'Saldo líquido a pagar', 'Comissão já paga', 'Comissão pendente', 'Ação']}
            formatValue={(column, value, row) => {
              if (column === 'appointments') return <StatusBadge tone="gray">{value}</StatusBadge>
              if (['revenue', 'commission', 'advancesDiscounted', 'netCommission', 'commissionPaid', 'commissionPending'].includes(column)) return money.format(value)
              if (column === 'action') return (
                <button type="button" disabled={row.commissionPending <= 0} onClick={() => setPaymentEmployee(row)} className="focus-ring rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Marcar comissão como paga
                </button>
              )
              return value
            }}
          />
        ) : (
          <EmptyState>Nenhum valor de comissão encontrado para este filtro.</EmptyState>
        )}
      </div>
      {selectedEmployee && (
        <EmployeeAppointmentsModal
          salonId={salonId}
          employee={selectedEmployee}
          entries={resultEntries.filter((entry) => String(field(entry, 'employeeId', 'employee_id')) === String(selectedEmployee.employeeId) || cashEmployeeName(entry) === selectedEmployee.employeeName)}
          setCashEntries={setCashEntries}
          user={user}
          setAuditLogs={setAuditLogs}
          onClose={() => setSelectedEmployee(null)}
          notify={notify}
        />
      )}
      {paymentEmployee && (
        <CommissionPaymentModal
          salonId={salonId}
          employee={paymentEmployee}
          entries={paymentEmployee.entries.filter((entry) => !cashCommissionPaid(entry))}
          advances={resultAdvances.filter((advance) => advanceStatus(advance) === 'pendente' && isAdvanceForEmployee(advance, paymentEmployee.employeeId, paymentEmployee.employeeName))}
          periodStart={startDate}
          periodEnd={endDate}
          setCommissionPayments={setCommissionPayments}
          setCashEntries={setCashEntries}
          setAdvances={setAdvances}
          user={user}
          setAuditLogs={setAuditLogs}
          onClose={() => setPaymentEmployee(null)}
          notify={notify}
        />
      )}
    </section>
  )
}

function CommissionPaymentModal({ salonId, employee, entries, advances = [], periodStart, periodEnd, setCashEntries, setAdvances, setCommissionPayments, user, setAuditLogs, onClose, notify }) {
  const [form, setForm] = useState({ paymentMethod: 'pix', notes: '' })
  const [saving, setSaving] = useState(false)
  const totalPending = entries.reduce((sum, entry) => sum + cashCommissionValue(entry), 0)
  const advancesToDiscount = advances.filter((advance) => isValidAdvance(advance) && advanceStatus(advance) === 'pendente')
  const advancesTotal = advancesToDiscount.reduce((sum, advance) => sum + advanceValue(advance), 0)
  const netTotal = Math.max(totalPending - advancesTotal, 0)

  async function confirmPayment(event) {
    event.preventDefault()
    if (totalPending <= 0) return
    if (!String(form.notes ?? '').trim()) {
      notify?.('Informe o motivo da alteração.', 'error')
      return
    }
    setSaving(true)
    const paidAt = new Date().toISOString()
    try {
      const updatedEntries = await Promise.all(entries.map((entry) => updateCashMovementRecord(salonId, entry.id, {
        commissionPaid: true,
        commissionPaidAt: paidAt,
        commissionPaymentMethod: form.paymentMethod,
        commissionNotes: form.notes
      })))
      const discountedAt = paidAt
      const updatedAdvances = await Promise.all(advancesToDiscount.map((advance) => updateAdvanceRecord(salonId, advance.id, {
        status: 'descontado',
        discountedAt,
        discounted_at: discountedAt
      })))
      const paymentRecord = normalizeCommissionPaymentRecord(await createCommissionPaymentRecord(salonId, {
        employeeId: employee.employeeId || null,
        employeeName: employee.employeeName,
        amount: netTotal,
        commissionGross: totalPending,
        advancesTotal,
        paymentMethod: form.paymentMethod,
        notes: [form.notes, advancesTotal > 0 ? `Comissao bruta: ${money.format(totalPending)}. Vales descontados: ${money.format(advancesTotal)}. Valor liquido pago: ${money.format(netTotal)}.` : ''].filter(Boolean).join(' '),
        periodStart,
        periodEnd,
        paidAt,
        cashMovementIds: entries.map((entry) => entry.id).filter(Boolean),
        advanceIds: advancesToDiscount.map((advance) => advance.id).filter(Boolean)
      }))
      const normalized = updatedEntries.map(normalizeCashMovementRecord)
      const normalizedAdvances = updatedAdvances.map(normalizeAdvanceRecord)
      await recordAuditLog({
        salonId,
        user,
        action: 'pagamento_comissao',
        entityType: 'commission_payment',
        entityId: paymentRecord.id,
        oldData: { cashMovements: entries, advances: advancesToDiscount },
        newData: { payment: paymentRecord, cashMovements: normalized, advances: normalizedAdvances },
        reason: form.notes,
        onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
      })
      setCashEntries?.((current) => current.map((entry) => normalized.find((updated) => String(updated.id) === String(entry.id)) ?? entry))
      setAdvances?.((current) => current.map((advance) => normalizedAdvances.find((updated) => String(updated.id) === String(advance.id)) ?? advance))
      setCommissionPayments?.((current) => [paymentRecord, ...(current || [])])
      notify?.('Comissão marcada como paga com vales descontados.')
      onClose()
    } catch (error) {
      handleDataActionError(error, notify)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Marcar comissão como paga" onClose={onClose} maxWidth="max-w-2xl" zClass="z-50">
      <form onSubmit={confirmPayment} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-pearl p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Funcionário</p>
            <p className="mt-1 text-xl font-black text-graphite dark:text-gray-100">{employee.employeeName}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Comissão pendente</p>
            <p className="mt-1 text-xl font-black text-graphite dark:text-gray-100">{money.format(totalPending)}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Vales descontados</p>
            <p className="mt-1 text-xl font-black text-graphite dark:text-gray-100">{money.format(advancesTotal)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 dark:border-cyan-400/20 dark:bg-cyan-500/10">
            <p className="text-sm font-bold text-cyan-800 dark:text-cyan-200">Saldo líquido a pagar</p>
            <p className="mt-1 text-xl font-black text-graphite dark:text-gray-100">{money.format(netTotal)}</p>
          </div>
        </div>
        <Select label="Forma de pagamento" value={form.paymentMethod} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} options={['Pix', 'Dinheiro', 'Transferência']} values={['pix', 'dinheiro', 'transferencia']} />
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Motivo da alteração</span>
          <textarea className={`${inputBase} min-h-24`} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} required />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={buttonSecondary}>Cancelar</button>
          <button type="submit" disabled={saving || totalPending <= 0} className={buttonPrimary}>{saving ? 'Salvando...' : 'Confirmar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EmployeeAppointmentsModal({ salonId, employee, entries, setCashEntries, user, setAuditLogs, onClose, notify }) {
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const timer = window.setTimeout(() => setLoading(false), 180)
    return () => window.clearTimeout(timer)
  }, [employee?.employeeId])

  function replaceEntry(updatedEntry) {
    setCashEntries?.((current) => current.map((entry) => String(entry.id) === String(updatedEntry.id) ? updatedEntry : entry))
  }

  return (
    <Modal title="Atendimentos do funcionário" onClose={onClose} maxWidth="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black text-graphite dark:text-gray-100">{employee.employeeName}</p>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{entries.length} atendimento(s) pago(s)</p>
        </div>
        <StatusBadge tone="green">Pago e ativo</StatusBadge>
      </div>

      {loading ? (
        <EmptyState>Carregando atendimentos...</EmptyState>
      ) : entries.length ? (
        <Table
          rows={entries}
          columns={['client', 'service', 'date', 'value', 'commission', 'paymentMethod', 'status']}
          labels={['Cliente', 'Serviço', 'Data', 'Valor', 'Comissão', 'Forma de pagamento', 'Status']}
          onRowClick={(row) => setSelectedEntry(row)}
          formatValue={(key, value, row) => {
            if (key === 'client') return cashClientName(row) || '-'
            if (key === 'service') return cashServiceName(row) || '-'
            if (key === 'date') return formatDate(cashDate(row))
            if (key === 'value') return money.format(cashServiceValue(row))
            if (key === 'commission') return money.format(cashCommissionValue(row))
            if (key === 'paymentMethod') return <PaymentMethodBadge method={cashMethod(row)} />
            if (key === 'status') return <StatusBadge tone="green">Pago</StatusBadge>
            return value
          }}
        />
      ) : (
        <EmptyState>Nenhum atendimento pago encontrado para este funcionário no período.</EmptyState>
      )}

      {selectedEntry && (
        <EditCashMovementModal
          salonId={salonId}
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onSaved={(updatedEntry) => {
            replaceEntry(updatedEntry)
            setSelectedEntry(updatedEntry)
          }}
          onRemoved={(updatedEntry) => {
            replaceEntry(updatedEntry)
            setSelectedEntry(null)
          }}
          user={user}
          setAuditLogs={setAuditLogs}
          notify={notify}
        />
      )}
    </Modal>
  )
}

function EditCashMovementModal({ salonId, entry, onClose, onSaved, onRemoved, user, setAuditLogs, notify }) {
  const [form, setForm] = useState({
    serviceValue: String(cashServiceValue(entry)),
    commissionPercent: String(field(entry, 'commissionPercent', 'commission_percent') ?? 0),
    paymentMethod: normalizeAppointmentPaymentMethod(cashMethod(entry)) ?? 'pix',
    paymentStatus: cashStatus(entry),
    reason: ''
  })
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function save(event) {
    event.preventDefault()
    const serviceValue = Number(form.serviceValue) || 0
    const commissionPercent = Number(form.commissionPercent) || 0
    const commissionValue = (serviceValue * commissionPercent) / 100
    const salonValue = serviceValue - commissionValue
    const payload = {
      serviceValue,
      amount: serviceValue,
      commissionPercent,
      commissionValue,
      salonValue,
      paymentMethod: form.paymentMethod,
      status: form.paymentStatus
    }
    if (!String(form.reason ?? '').trim()) {
      notify?.('Informe o motivo da alteração.', 'error')
      return
    }

    setSaving(true)
    try {
      const savedEntry = normalizeCashMovementRecord(await updateCashMovementRecord(salonId, entry.id, payload))
      await recordAuditLog({
        salonId,
        user,
        action: 'edicao_lancamento_financeiro',
        entityType: 'cash_movement',
        entityId: entry.id,
        oldData: entry,
        newData: savedEntry,
        reason: form.reason,
        onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
      })
      onSaved(savedEntry)
      notify?.('Atendimento atualizado com sucesso.')
    } catch (error) {
      handleDataActionError(error, notify)
    } finally {
      setSaving(false)
    }
  }

  async function removeEntry() {
    if (!String(form.reason ?? '').trim()) {
      notify?.('Informe o motivo da alteração.', 'error')
      return
    }
    setRemoving(true)
    try {
      const savedEntry = normalizeCashMovementRecord(await updateCashMovementRecord(salonId, entry.id, { status: 'cancelado', cancelledAt: new Date().toISOString(), cancelledReason: form.reason, cancelled_reason: form.reason }))
      await recordAuditLog({
        salonId,
        user,
        action: 'cancelamento_lancamento_financeiro',
        entityType: 'cash_movement',
        entityId: entry.id,
        oldData: entry,
        newData: savedEntry,
        reason: form.reason,
        onCreated: (log) => setAuditLogs?.((current) => [log, ...(current || [])])
      })
      onRemoved(savedEntry)
      notify?.('Lançamento removido dos cálculos.')
    } catch (error) {
      handleDataActionError(error, notify)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Modal title="Editar atendimento" onClose={onClose} maxWidth="max-w-2xl" zClass="z-50">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor do serviço" type="number" min="0" value={form.serviceValue} onChange={(value) => setForm((current) => ({ ...current, serviceValue: value }))} />
          <Field label="Comissão (%)" type="number" min="0" value={form.commissionPercent} onChange={(value) => setForm((current) => ({ ...current, commissionPercent: value }))} />
          <Select label="Forma de pagamento" value={form.paymentMethod} onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value }))} options={['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Pendente']} values={['pix', 'dinheiro', 'debito', 'credito', 'pendente']} />
          <Select label="Status" value={form.paymentStatus} onChange={(value) => setForm((current) => ({ ...current, paymentStatus: value }))} options={['Pago', 'Pendente']} values={['pago', 'pendente']} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-pearl p-4 text-sm font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
          Comissão recalculada: {money.format(((Number(form.serviceValue) || 0) * (Number(form.commissionPercent) || 0)) / 100)}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Motivo da alteração</span>
          <textarea className={`${inputBase} min-h-24`} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={removeEntry} disabled={saving || removing} className={buttonDanger}>{removing ? 'Removendo...' : 'Remover lançamento'}</button>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving || removing} className={buttonSecondary}>Cancelar</button>
            <button type="submit" disabled={saving || removing} className={buttonPrimary}>{saving ? 'Salvando...' : 'Salvar atendimento'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function ProfessionalAgenda({ user, appointments, employees, blockedSlots, salonSettings, notify }) {
  const employee = employees.find((item) => isProfessional(item) && isEmployeeForUser(item, user))
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
  const employee = employees.find((item) => isEmployeeForUser(item, user))
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
      console.log('salon_id usado para salvar configuracoes:', salonId)
      const saved = normalizeSalonSettings(await updateSalonRecord(salonId, payload))
      setSettings((current) => ({ ...current, ...saved }))
      notify?.('Salvo com sucesso')
    } catch (error) {
      console.error('erro real do Supabase:', error?.original ?? error)
      handleDataActionError(error, notify)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <form onSubmit={saveSalonSettings} className="space-y-6 rounded-2xl border border-blush bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1c1922] sm:p-8">
        <div>
          <h3 className="text-xl font-bold">Configurações do salão</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajuste os dados de atendimento, recepção e funcionamento do salão.</p>
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
            {saving ? uiText.common.saving : uiText.common.save}
          </button>
        </div>
      </form>
    </div>
  )
}

function Modal({ title, children, onClose, maxWidth = 'max-w-xl', zClass = 'z-40' }) {
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
    <div className={`fixed inset-0 ${zClass} flex items-center justify-center bg-graphite/35 px-4 py-6`}>
      <div ref={modalRef} className={`simple-scrollbar max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-3xl border border-blush bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className={`${buttonSecondary} px-3 py-2`}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ReasonModal({ title = 'Motivo da alteração', description, confirmLabel = 'Confirmar', danger = false, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!reason.trim()) return
    setSaving(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-lg" zClass="z-50">
      <form onSubmit={submit} className="space-y-4">
        {description && <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{description}</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Motivo da alteração</span>
          <textarea className={`${inputBase} min-h-28`} value={reason} onChange={(event) => setReason(event.target.value)} required />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={buttonSecondary}>Cancelar</button>
          <button type="submit" disabled={saving || !reason.trim()} className={danger ? buttonDanger : buttonPrimary}>{saving ? 'Salvando...' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
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

function StatusBadge({ tone = 'gray', children }) {
  const tones = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-400/30 dark:bg-cyan-500/15 dark:text-cyan-200',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-400/30 dark:bg-yellow-500/15 dark:text-yellow-200',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-300',
    gray: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/10 dark:text-gray-200'
  }
  return <span className={`${badgeBase} ${tones[tone] ?? tones.gray}`}>{children}</span>
}

function PaymentMethodBadge({ method }) {
  const normalizedMethod = normalizeAppointmentPaymentMethod(method)
  const tones = {
    pix: 'cyan',
    dinheiro: 'green',
    debito: 'gray',
    credito: 'rose',
    pendente: 'amber'
  }
  return <StatusBadge tone={tones[normalizedMethod] ?? 'gray'}>{paymentMethodLabel(normalizedMethod)}</StatusBadge>
}

function EmptyState({ children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-pearl px-4 py-5 text-sm font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
      {children}
    </div>
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

function AppointmentStatusSelect({ value, onChange, roundedClass = 'rounded-xl' }) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const containerRef = useRef(null)
  const menuRef = useRef(null)
  const normalizedValue = normalizeAppointmentStatus(value)

  useEffect(() => {
    if (!open) return undefined

    function updateMenuPosition() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const menuWidth = Math.max(220, rect.width)
      const viewportPadding = 8
      const estimatedMenuHeight = 292
      const hasRoomBelow = window.innerHeight - rect.bottom >= estimatedMenuHeight + viewportPadding
      const top = hasRoomBelow ? rect.bottom + 8 : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8)
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding
      )

      setMenuPosition({ top, left, width: menuWidth })
    }

    function handlePointerDown(event) {
      if (
        !containerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    updateMenuPosition()
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open])

  function selectStatus(status) {
    onChange(status)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative min-w-[190px] flex-shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`focus-ring flex w-full items-center justify-between gap-2 border px-3 py-2 text-sm font-semibold shadow-sm transition ${roundedClass} ${statusStyles[normalizedValue] ?? statusStyles.agendado}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{formatAppointmentStatus(normalizedValue)}</span>
        <span className="text-xs opacity-80" aria-hidden="true">▾</span>
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Status do agendamento"
          className="fixed z-50 overflow-hidden rounded-xl border border-white/10 bg-[#1e1e2f] p-1 text-white shadow-2xl"
          style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
        >
          {appointmentStatusOptions.map(({ value: status, label }) => {
            const selected = status === normalizedValue
            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={selected}
                className={`focus-ring flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition hover:bg-[#2a2a3d] ${selected ? 'bg-[#2a2a3d] ring-1 ring-white/15' : 'bg-transparent'} ${getAppointmentStatusTextClass(status)}`}
                onClick={() => selectStatus(status)}
              >
                <span>{label}</span>
                {selected && <span className="text-xs font-black text-white" aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
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

function Table({ rows, columns, labels, formatValue, onRowClick }) {
  return (
    <div className="simple-scrollbar overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-gray-500 dark:border-white/10 dark:text-gray-400">
            {labels.map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (!row) return null
            return (
              <tr
                key={row.id ?? index}
                className={`border-b border-gray-50 transition hover:bg-pearl dark:border-white/5 dark:hover:bg-white/5 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') onRowClick(row)
                } : undefined}
              >
                {columns.map((column) => <td key={column} className="px-3 py-3 font-medium text-gray-700 dark:text-gray-200">{formatValue(column, row[column], row)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default App

