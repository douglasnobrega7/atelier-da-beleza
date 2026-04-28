import { useEffect, useRef, useState } from 'react'
import {
  advances as initialAdvances,
  appointments as initialAppointments,
  cashFlow as initialCashFlow,
  clients as initialClients,
  employees as initialEmployees,
  inventory as initialInventory,
  services as initialServices,
  weeklyRevenue
} from './data/mockData'
import { supabase } from './lib/supabase'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
let services = initialServices

function getTodayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - (offset * 60 * 1000)).toISOString().slice(0, 10)
}

const todayIso = getTodayIso()

function timeToMinutes(time) {
  const [hoursValue, minutesValue] = time.split(':').map(Number)
  return (hoursValue * 60) + minutesValue
}

function minutesToTime(totalMinutes) {
  const hoursValue = Math.floor(totalMinutes / 60)
  const minutesValue = totalMinutes % 60
  return `${String(hoursValue).padStart(2, '0')}:${String(minutesValue).padStart(2, '0')}`
}

function serviceDurationToMinutes(duration, fallback = 60) {
  if (!duration) return fallback
  const hoursMatch = duration.match(/(\d+)\s*h/)
  const minutesMatch = duration.match(/(\d+)\s*min/)
  const hoursValue = hoursMatch ? Number(hoursMatch[1]) * 60 : 0
  const minutesValue = minutesMatch ? Number(minutesMatch[1]) : 0
  return hoursValue + minutesValue || fallback
}

function getAppointmentDuration(appointment, employee) {
  const service = services.find((item) => item.name === appointment.service)
  return Number(appointment.duracao) || Number(appointment.duration) || serviceDurationToMinutes(service?.duration, Number(employee?.defaultDuration) || 60)
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA
}

function getAvailableSlots({ employee, date, service, appointments, blockedSlots = [] }) {
  if (!employee || !date || employee.workStatus === 'De folga') return []

  const start = timeToMinutes(employee.workStart)
  const end = timeToMinutes(employee.workEnd)
  const duration = serviceDurationToMinutes(service?.duration, Number(employee.defaultDuration) || 60)
  const scheduleInterval = Math.max(5, Number(employee.scheduleInterval) || duration)
  const breakStart = employee.breakStart ? timeToMinutes(employee.breakStart) : null
  const breakEnd = employee.breakEnd ? timeToMinutes(employee.breakEnd) : null
  const booked = appointments.filter((appointment) => (
    appointment.professional === employee.name &&
    appointment.date === date &&
    appointment.status !== 'Cancelado'
  ))
  const blocked = blockedSlots.filter((block) => block.professional === employee.name && block.date === date)

  const slots = []
  for (let current = start; current + duration <= end; current += scheduleInterval) {
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
      appointment.professional === employee.name &&
      appointment.date === date &&
      appointment.status !== 'Cancelado'
    ))
    .sort((a, b) => (a.time ?? a.horario).localeCompare(b.time ?? b.horario))
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
  const employee = employees.find((item) => item.name === appointment.professional)
  return calculateCommissionDetails(appointment, employee).comissaoCalculada
}

function getCommissionRule(appointment, employee) {
  const specific = employee?.serviceCommissions?.find((item) => item.service === appointment.service)
  if (specific) return { type: specific.type, value: Number(specific.value) || 0, source: 'service' }
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
  if (appointment.status !== 'Concluído') return 0
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
  return `${normalizeLoginPart(settings?.salonName ?? 'Atelier da Beleza', 'salao')}.com`
}

function getSidebarSalonName(salonName) {
  const name = salonName?.trim()
  if (!name) return ''
  return name.replace(/^salão\s+/i, '').trim()
}

function getSuggestedAccessEmail({ name, employeeType = 'professional', salonSettings }) {
  const domain = getSalonDomain(salonSettings)
  if (employeeType === 'admin') return `admin@${domain}`
  if (employeeType === 'cashier') return `caixa@${domain}`
  return `${normalizeLoginPart(name, 'profissional')}@${domain}`
}

function getProfessionals(employees) {
  return employees.filter(isProfessional)
}

function withCommission(appointment, employees) {
  if (appointment.status !== 'Concluído') return { ...appointment, commission: 0, comissaoCalculada: 0 }
  const employee = employees.find((item) => item.name === appointment.professional)
  return { ...appointment, ...calculateCommissionDetails(appointment, employee) }
}

function getClientInsights(clientName, appointments) {
  const visits = appointments.filter((item) => item.client === clientName && item.status === 'Concluído')
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
  Aguardando: 'bg-amber-50 text-amber-700 border-amber-200',
  Confirmado: 'bg-lilacSoft/40 text-violet-700 border-violet-100',
  'Concluído': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelado: 'bg-rose-50 text-rose-700 border-rose-200'
}

const employeeStatuses = ['Ativo', 'De folga', 'Horário de almoço']
const employeeStatusStyles = {
  Ativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'De folga': 'bg-rose-50 text-rose-700 border-rose-200',
  'Horário de almoço': 'bg-amber-50 text-amber-700 border-amber-200'
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

async function loadUserProfileByEmail(email, employees = []) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, salon_id')
    .eq('email', email)
    .single()

  if (error || !data) return null
  return normalizeUserProfile(data, employees)
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
  const [cashEntries, setCashEntries] = useState(() => {
    const advanceEntries = initialAdvances.map((advance) => createAdvanceCashEntry(advance))
    return [...initialCashFlow, ...advanceEntries]
  })
  const [cashClosures, setCashClosures] = useState([])
  const [advances, setAdvances] = useState(initialAdvances)
  const [blockedSlots, setBlockedSlots] = useState([])
  const [salonSettings, setSalonSettings] = useState({ salonName: '', receptionWhatsapp: '5511988889090' })
  const [serviceItems, setServiceItems] = useState(initialServices)
  services = serviceItems
  const [appointments, setAppointments] = useState(initialAppointments.map((appointment) => withCommission({ ...appointment, date: appointment.date ?? todayIso }, initialEmployees)))
  const [clients, setClients] = useState(initialClients.map((client) => ({ ...client, active: client.active ?? true })))
  const [inventoryItems, setInventoryItems] = useState(initialInventory.map((item) => ({
    ...item,
    name: item.name ?? item.product,
    category: item.category ?? 'Uso geral',
    unit: item.unit ?? 'unidade',
    notes: item.notes ?? ''
  })))
  const [employees, setEmployees] = useState(initialEmployees.map((employee) => ({
    ...employee,
    workStatus: employee.workStatus ?? 'Ativo',
    employeeType: employee.employeeType ?? 'professional',
    workStart: employee.workStart ?? (employee.employeeType === 'cashier' ? '' : '09:00'),
    workEnd: employee.workEnd ?? (employee.employeeType === 'cashier' ? '' : '18:00'),
    breakStart: employee.breakStart ?? '',
    breakEnd: employee.breakEnd ?? '',
    defaultDuration: employee.defaultDuration ?? 60,
    scheduleInterval: employee.scheduleInterval ?? employee.defaultDuration ?? 60,
    serviceCommissions: isProfessional(employee) ? employee.serviceCommissions ?? [] : [],
    services: isProfessional(employee) ? employee.services ?? [] : [],
    accessEmail: employee.accessEmail ?? '',
    temporaryPassword: employee.temporaryPassword ?? '',
    loginActive: employee.loginActive ?? false
  })))

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

        const profile = await loadUserProfileByEmail(email, employees)
        if (!active) return

        const user = profile ?? createAdminFallbackUser(authUser)
        setCurrentUser(user)
        setActivePage(getInitialPageForRole(user.role))
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
    const normalizedEmail = email.trim().toLowerCase()
    console.log('Tentando login:', email)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim()
      })

      if (error) {
        console.error('Erro Supabase:', error)
        return false
      }

      if (keepConnected) {
        window.localStorage.setItem(sessionPersistenceKey, 'local')
        window.sessionStorage.removeItem(browserSessionKey)
      } else {
        window.localStorage.setItem(sessionPersistenceKey, 'session')
        window.sessionStorage.setItem(browserSessionKey, 'true')
      }

      const profile = await loadUserProfileByEmail(normalizedEmail, employees)
      const user = profile ?? createAdminFallbackUser(data.user)

      setCurrentUser(user)
      setActivePage(getInitialPageForRole(user.role))
      return true
    } catch (error) {
      console.error('Erro Supabase:', error)
      return false
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.localStorage.removeItem(sessionPersistenceKey)
    window.sessionStorage.removeItem(browserSessionKey)
    setCurrentUser(null)
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
            <PageRouter
              page={safePage}
              user={currentUser}
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
      const loggedIn = await onLogin(email, password, keepConnected)
      if (!loggedIn) {
        setError('E-mail ou senha inválidos')
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
                  className="focus-ring w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100"
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
                  className="focus-ring w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100"
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
            <button type="button" onClick={handleLogin} disabled={loading} className="focus-ring mt-6 rounded-2xl bg-graphite px-5 py-3 font-semibold text-white shadow-soft transition hover:bg-[#343039] disabled:cursor-not-allowed disabled:opacity-70">
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

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false, min, step = type === 'number' ? '0.01' : undefined }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-600">{label}</span>
      <input
        className="focus-ring w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
        required={required}
        min={min}
        step={step}
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
          <button onClick={onLogout} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/10 lg:hidden">
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
        <button onClick={onLogout} className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-white/10 dark:bg-[#24202c] dark:hover:bg-white/10">
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
    ...appointments.filter((item) => `${item.client} ${item.service} ${item.professional}`.toLowerCase().includes(search)).map((item) => ({ label: `${item.client} · ${item.time}`, detail: `Agenda · ${item.service}`, page: 'agenda' }))
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
            className="focus-ring w-full rounded-2xl border border-blush bg-white px-4 py-2 text-sm font-semibold dark:border-white/10 dark:bg-[#24202c]"
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

function PageRouter({ page, user, appointments, setAppointments, clients, setClients, cashEntries, setCashEntries, cashClosures, setCashClosures, advances, setAdvances, blockedSlots, setBlockedSlots, inventoryItems, setInventoryItems, employees, setEmployees, services, setServices, salonSettings, setSalonSettings, agendaProfessional, setAgendaProfessional, onOpenAgendaForProfessional, notify }) {
  const employeeAppointments = appointments.filter((item) => item.professional === user.name)
  const visibleAppointments = appointments
  const activeClients = clients.filter((client) => client.active)
  const professionals = getProfessionals(employees)

  const pages = {
    dashboard: <AdminDashboard appointments={appointments} employees={employees} clients={clients} cashEntries={cashEntries} advances={advances} />,
    agenda: <Agenda appointments={visibleAppointments} setAppointments={setAppointments} user={user} clients={activeClients} employees={professionals} allEmployees={employees} blockedSlots={blockedSlots} setBlockedSlots={setBlockedSlots} setCashEntries={setCashEntries} initialProfessionalFilter={agendaProfessional} onProfessionalFilterChange={setAgendaProfessional} notify={notify} />,
    clientes: <Clients user={user} clients={clients} setClients={setClients} appointments={appointments} notify={notify} />,
    servicos: <Services user={user} services={services} setServices={setServices} notify={notify} />,
    funcionarios: <Employees user={user} employees={employees} setEmployees={setEmployees} salonSettings={salonSettings} onOpenAgendaForProfessional={onOpenAgendaForProfessional} notify={notify} />,
    caixa: <CashRegister entries={cashEntries} setEntries={setCashEntries} closures={cashClosures} setClosures={setCashClosures} notify={notify} />,
    vales: user.role === 'admin' || user.role === 'cashier' ? <Advances user={user} employees={employees} advances={advances} setAdvances={setAdvances} setCashEntries={setCashEntries} notify={notify} /> : <AccessDenied />,
    estoque: <Inventory user={user} items={inventoryItems} setItems={setInventoryItems} notify={notify} />,
    relatorios: user.role === 'admin' ? <Reports appointments={appointments} employees={employees} user={user} /> : <AccessDenied />,
    perfil: <EmployeeProfile user={user} appointments={employeeAppointments} employees={employees} setEmployees={setEmployees} />,
    'minha-agenda': <ProfessionalAgenda user={user} appointments={employeeAppointments} employees={employees} blockedSlots={blockedSlots} salonSettings={salonSettings} notify={notify} />,
    configuracoes: user.role === 'admin' ? <Settings settings={salonSettings} setSettings={setSalonSettings} /> : <AccessDenied />
  }

  return pages[page] ?? <Agenda appointments={visibleAppointments} setAppointments={setAppointments} user={user} clients={activeClients} employees={professionals} allEmployees={employees} blockedSlots={blockedSlots} setBlockedSlots={setBlockedSlots} setCashEntries={setCashEntries} initialProfessionalFilter={agendaProfessional} onProfessionalFilterChange={setAgendaProfessional} notify={notify} />
}

function AdminDashboard({ appointments, employees, clients, cashEntries, advances }) {
  const professionals = getProfessionals(employees)
  const completed = appointments.filter((item) => item.status === 'Concluído')
  const dayRevenue = completed.reduce((sum, item) => sum + item.value, 0)
  const monthRevenue = completed.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const commissions = professionals.map((employee) => ({ name: employee.name, value: completed.filter((item) => item.professional === employee.name).reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0) }))
  const todayCompleted = completed.filter((item) => item.date === todayIso)
  const dayCommissions = todayCompleted.reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0)
  const monthCommissions = completed.reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0)
  const topClient = topEntries(countBy(completed, (item) => item.client), 1)[0]
  const busyHours = topEntries(countBy(appointments.filter((item) => item.status !== 'Cancelado'), (item) => item.time?.slice(0, 2) + ':00'))
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
            {appointments.filter((item) => item.status !== 'Cancelado').slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-3 text-sm">
                <p className="font-semibold">{formatDate(item.date)} · {item.time} · {item.client}</p>
                <p className="text-gray-500">{item.service} com {item.professional}</p>
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
    const completed = appointments.filter((item) => item.date === date && item.status === 'Concluído')
    const fallback = weeklyRevenue.find((item) => item.day === getWeekdayLabel(date).replace('.', '').slice(0, 3))
    return {
      date,
      day: getWeekdayLabel(date).replace('.', ''),
      value: completed.length ? completed.reduce((sum, item) => sum + Number(item.value ?? 0), 0) : Number(fallback?.value ?? 0),
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

function Agenda({ appointments, setAppointments, user, clients, employees, allEmployees = employees, blockedSlots, setBlockedSlots, setCashEntries, initialProfessionalFilter = 'all', onProfessionalFilterChange, notify }) {
  const defaultProfessional = employees.find((item) => item.active && item.name === user.name)?.name ?? employees.find((item) => item.active)?.name ?? ''
  const firstService = services[0] ?? { name: '', price: 0 }
  const createInitialAppointmentForm = () => ({ client: clients[0]?.name ?? '', service: firstService.name, professional: defaultProfessional, date: todayIso, time: '', value: firstService.price })
  const [form, setForm] = useState(createInitialAppointmentForm)
  const [formMessage, setFormMessage] = useState({ type: '', text: '' })
  const [professionalFilter, setProfessionalFilter] = useState(initialProfessionalFilter)
  const [agendaView, setAgendaView] = useState('day')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const selectedProfessional = employees.find((employee) => employee.name === form.professional)
  const filteredProfessional = employees.find((employee) => employee.name === professionalFilter)
  const selectedService = services.find((item) => item.name === form.service)
  const availableSlots = getAvailableSlots({ employee: selectedProfessional, date: form.date, service: selectedService, appointments, blockedSlots })
  const filterAvailableSlots = getAvailableSlots({ employee: filteredProfessional, date: form.date, service: selectedService, appointments, blockedSlots })
  const occupiedSlots = getOccupiedSlots({ employee: filteredProfessional, date: form.date, appointments })
  const selectedSlotAvailable = availableSlots.includes(form.time)
  const weekDates = getWeekDates(form.date)
  const visibleAppointments = appointments.filter((item) => (
    (agendaView === 'day' ? item.date === form.date : weekDates.includes(item.date)) &&
    (professionalFilter === 'all' || item.professional === professionalFilter)
  ))
  const visibleBlocks = blockedSlots.filter((item) => (
    (agendaView === 'day' ? item.date === form.date : weekDates.includes(item.date)) &&
    (professionalFilter === 'all' || item.professional === professionalFilter)
  ))
  const selectedClient = clients.find((client) => client.name === form.client)
  const selectedClientInsights = selectedClient ? getClientInsights(selectedClient.name, appointments) : null

  useEffect(() => {
    const safeFilter = initialProfessionalFilter === 'all' || employees.some((item) => item.name === initialProfessionalFilter) ? initialProfessionalFilter : 'all'
    setProfessionalFilter(safeFilter)
    if (safeFilter !== 'all') {
      setForm((current) => ({ ...current, professional: safeFilter, time: '' }))
    }
  }, [initialProfessionalFilter, employees])

  function changeProfessionalFilter(value) {
    setProfessionalFilter(value)
    onProfessionalFilterChange?.(value)
    if (value !== 'all') {
      setForm((current) => ({ ...current, professional: value, time: '' }))
    }
  }

  function updateStatus(id, status) {
    setAppointments((current) => current.map((item) => {
      if (item.id !== id) return item
      if (user.role !== 'admin' && user.role !== 'cashier' && item.professional !== user.name) return item
      return withCommission({ ...item, status }, allEmployees)
    }))
    if (status === 'Concluído') notify?.('Comissão calculada automaticamente.')
  }

  function sendConfirmation(appointment) {
    const client = clients.find((item) => item.name === appointment.client)
    const phone = normalizePhone(client?.phone)
    if (!phone) {
      notify?.('Cliente sem telefone cadastrado.', 'error')
      return
    }
    const message = `Olá ${appointment.client}\nSeu horário está marcado para dia ${formatDate(appointment.date)} às ${appointment.time} com ${appointment.professional}.\nServiço: ${appointment.service}\nQualquer dúvida é só avisar`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  function saveBlock(data) {
    if (!data.professional || !data.date || !data.start || !data.end || timeToMinutes(data.end) <= timeToMinutes(data.start)) {
      notify?.('Erro ao bloquear: confira profissional, data e Horários.', 'error')
      return
    }
    setBlockedSlots((current) => [...current, { ...data, id: Date.now() }])
    setBlockModalOpen(false)
    notify?.('Horário bloqueado com sucesso.')
  }

  function saveQuickService(data) {
    if (!data.client.trim() || !data.service || !data.professional || Number(data.value) <= 0) {
      notify?.('Erro ao salvar: confira cliente, serviço, profissional e valor.', 'error')
      return
    }
    const professional = employees.find((item) => item.name === data.professional)
    const now = new Date()
    const date = getTodayIso()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const appointment = withCommission({
      id: Date.now(),
      client: data.client,
      service: data.service,
      professional: data.professional,
      date,
      time,
      horario: time,
      value: Number(data.value) || 0,
      valor: Number(data.value) || 0,
      duration: serviceDurationToMinutes(services.find((item) => item.name === data.service)?.duration, professional?.defaultDuration ?? 60),
      duracao: serviceDurationToMinutes(services.find((item) => item.name === data.service)?.duration, professional?.defaultDuration ?? 60),
      status: 'Concluído',
      paymentMethod: data.paymentMethod
    }, allEmployees)
    setAppointments((current) => [...current, appointment])
    setCashEntries((current) => [...current, { id: Date.now() + 1, type: 'Entrada', description: `Atendimento rápido - ${data.client}`, method: data.paymentMethod, value: Number(data.value) || 0, date }])
    setQuickModalOpen(false)
    notify?.('Atendimento rápido concluído.')
  }

  function addAppointment(event) {
    event.preventDefault()
    const requiredFields = [
      ['client', 'cliente'],
      ['service', 'serviço'],
      ['professional', 'profissional'],
      ['date', 'data'],
      ['time', 'horário']
    ]
    const missingField = requiredFields.find(([key]) => !String(form[key] ?? '').trim())

    if (missingField) {
      setFormMessage({ type: 'error', text: `Preencha o campo ${missingField[1]} para agendar.` })
      notify?.('Erro ao salvar: confira os campos obrigatórios.', 'error')
      return
    }

    if (!selectedProfessional) {
      setFormMessage({ type: 'error', text: 'Selecione um profissional ativo.' })
      notify?.('Erro ao salvar: selecione um profissional.', 'error')
      return
    }

    if (!selectedSlotAvailable) {
      setFormMessage({ type: 'error', text: 'Escolha um horário disponível para esta data.' })
      notify?.('Erro ao salvar: horário indisponível.', 'error')
      return
    }

    const duration = serviceDurationToMinutes(selectedService?.duration, Number(selectedProfessional.defaultDuration) || 60)
    const value = Number(selectedService?.price ?? form.value)
    const newAppointment = withCommission({
      id: Date.now(),
      client: form.client,
      service: form.service,
      professional: form.professional,
      date: form.date,
      time: form.time,
      horario: form.time,
      value,
      valor: value,
      duration,
      duracao: duration,
      status: 'Aguardando'
    }, allEmployees)

    setAppointments((current) => [...current, newAppointment])
    setForm({ ...createInitialAppointmentForm(), date: form.date, professional: form.professional, time: '' })
    setFormMessage({ type: 'success', text: 'Agendamento criado com sucesso!' })
    notify?.('Agendamento criado.')
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
            const selected = services.find((item) => item.name === value)
            setForm({ ...form, service: value, value: selected?.price ?? form.value, time: '' })
          }} options={services.map((item) => item.name)} />
          <Select label="Profissional" value={form.professional} onChange={(value) => setForm({ ...form, professional: value, time: '' })} options={employees.filter((item) => item.active).map((item) => item.name)} />
          <DatePickerBar value={form.date} onChange={(value) => setForm({ ...form, date: value, time: '' })} />
          {selectedProfessional && (
            <div className="rounded-2xl border border-blush bg-pearl px-4 py-3 text-sm font-semibold text-gray-700">
              Expediente: {selectedProfessional.workStart} às {selectedProfessional.workEnd}
              {selectedProfessional.breakStart && selectedProfessional.breakEnd ? ` · intervalo ${selectedProfessional.breakStart} às ${selectedProfessional.breakEnd}` : ''}
            </div>
          )}
          <TimeSlotPicker value={form.time} onChange={(value) => setForm({ ...form, time: value })} slots={availableSlots} />
          {formMessage.text && (
            <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${formMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {formMessage.text}
            </div>
          )}
          <button className="focus-ring w-full rounded-2xl bg-graphite px-4 py-3 font-semibold text-white hover:bg-[#343039]">Agendar</button>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setBlockModalOpen(true)} className="focus-ring rounded-2xl border border-blush px-4 py-3 text-sm font-bold hover:bg-pearl">Bloquear horário</button>
            <button type="button" onClick={() => setQuickModalOpen(true)} className="focus-ring rounded-2xl border border-lilacSoft px-4 py-3 text-sm font-bold hover:bg-lilacSoft/20">Atender agora</button>
          </div>
        </form>
      </Panel>
      <div className="space-y-5">
        <AvailabilityPanel employee={filteredProfessional} date={form.date} service={selectedService} availableSlots={filterAvailableSlots} occupiedSlots={occupiedSlots} />
        <Panel title={`Agenda do Salão · ${formatDate(form.date)}`}>
          <div className="mb-4 inline-flex rounded-2xl border border-blush bg-pearl p-1 text-sm font-bold dark:border-white/10 dark:bg-white/5">
            <button type="button" onClick={() => setAgendaView('day')} className={`rounded-xl px-5 py-2 transition ${agendaView === 'day' ? 'bg-graphite text-white shadow-sm dark:bg-lilacSoft dark:text-graphite' : 'hover:bg-white dark:hover:bg-white/10'}`}>Dia</button>
            <button type="button" onClick={() => setAgendaView('week')} className={`rounded-xl px-5 py-2 transition ${agendaView === 'week' ? 'bg-graphite text-white shadow-sm dark:bg-lilacSoft dark:text-graphite' : 'hover:bg-white dark:hover:bg-white/10'}`}>Semana</button>
          </div>
          {agendaView === 'week' && <WeeklyAgenda weekDates={weekDates} appointments={visibleAppointments} blocks={visibleBlocks} employees={employees} user={user} onStatusChange={updateStatus} onSendConfirmation={sendConfirmation} />}
          {agendaView === 'day' && (
          <div className="simple-scrollbar max-h-[720px] space-y-3 overflow-auto pr-1">
            {visibleBlocks.map((block) => (
              <div key={block.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="text-lg font-bold">{block.start} às {block.end} · Horário bloqueado</p>
                <p className="mt-1">{block.professional} · {block.reason}</p>
              </div>
            ))}
            {[...visibleAppointments].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{formatDate(item.date)} · {item.time} · {item.client}</p>
                    <p className="mt-1 text-sm text-gray-600">{item.service} com {item.professional}</p>
                    <p className="mt-2 text-sm text-gray-500">Duração: {getAppointmentDuration(item, employees.find((employee) => employee.name === item.professional))} min</p>
                    {user.role === 'admin' && <p className="mt-2 text-sm font-semibold text-goldSoft">{money.format(item.value)}</p>}
                    {item.status === 'Concluído' && <p className="mt-1 text-sm font-semibold text-emerald-700">Comissão: {money.format(getAppointmentCommission(item, allEmployees))}</p>}
                  </div>
                  <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => sendConfirmation(item)} className="whitespace-nowrap rounded-full border border-blush px-3 py-2 text-sm font-bold hover:bg-pearl">Enviar confirmação</button>
                    <select className={`min-w-[130px] rounded-full border px-3 py-2 text-sm font-semibold ${statusStyles[item.status]}`} value={item.status} onChange={(event) => updateStatus(item.id, event.target.value)}>
                      {Object.keys(statusStyles).map((status) => <option key={status}>{status}</option>)}
                    </select>
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

function WeeklyAgenda({ weekDates, appointments, blocks, employees, user, onStatusChange, onSendConfirmation }) {
  const [selectedItem, setSelectedItem] = useState(null)
  const weeklyStatusStyles = {
    Aguardando: 'border-amber-200 bg-amber-50 text-amber-900',
    Confirmado: 'border-sky-200 bg-sky-50 text-sky-900',
    'Concluído': 'border-emerald-200 bg-emerald-50 text-emerald-900',
    Cancelado: 'border-rose-200 bg-rose-50 text-rose-900'
  }

  return (
    <>
      <div className="simple-scrollbar overflow-x-auto pb-2">
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {weekDates.map((date) => {
            const dayAppointments = appointments.filter((item) => item.date === date).sort((a, b) => a.time.localeCompare(b.time))
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
                      className={`block w-full rounded-xl border px-3 py-2 text-left text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${weeklyStatusStyles[item.status] ?? weeklyStatusStyles.Aguardando}`}
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
            <p><strong>Profissional:</strong> {selectedItem.professional}</p>
            <p><strong>Duração:</strong> {getAppointmentDuration(selectedItem, employees.find((employee) => employee.name === selectedItem.professional))} min</p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button type="button" onClick={() => onSendConfirmation(selectedItem)} className="whitespace-nowrap rounded-xl border border-blush px-4 py-2 text-sm font-bold hover:bg-pearl">Enviar confirmação</button>
              {(user.role === 'admin' || user.role === 'cashier' || selectedItem.professional === user.name) && (
                <select className={`min-w-[130px] rounded-xl border px-3 py-2 text-sm font-semibold ${statusStyles[selectedItem.status]}`} value={selectedItem.status} onChange={(event) => { onStatusChange(selectedItem.id, event.target.value); setSelectedItem({ ...selectedItem, status: event.target.value }) }}>
                  {Object.keys(statusStyles).map((status) => <option key={status}>{status}</option>)}
                </select>
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
  const [form, setForm] = useState({ professional: options[0] ?? '', date, start: '09:00', end: '10:00', reason: 'Horário bloqueado' })

  return (
    <Modal title="Bloquear horário" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Select label="Profissional" value={form.professional} onChange={(value) => setForm({ ...form, professional: value })} options={options} />
        <Field label="Data" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Horário inicial" type="time" value={form.start} onChange={(value) => setForm({ ...form, start: value })} />
          <Field label="Horário final" type="time" value={form.end} onChange={(value) => setForm({ ...form, end: value })} />
        </div>
        <Select label="Motivo" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} options={['Funcionário vai sair mais cedo', 'Cliente VIP reservado', 'Manutenção', 'Horário bloqueado']} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button>
          <button className="rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Bloquear</button>
        </div>
      </form>
    </Modal>
  )
}

function QuickServiceModal({ clients, employees, onClose, onSave }) {
  const firstService = services[0] ?? { name: '', price: 0 }
  const [form, setForm] = useState({ client: clients[0]?.name ?? '', service: firstService.name, professional: employees.find((item) => item.active)?.name ?? '', paymentMethod: 'Pix', value: firstService.price })

  return (
    <Modal title="Atender agora" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <ClientSearchInput label="Cliente ou nome avulso" value={form.client} onChange={(value) => setForm({ ...form, client: value })} clients={clients} />
        <Select label="Serviço" value={form.service} onChange={(value) => {
          const selected = services.find((item) => item.name === value)
          setForm({ ...form, service: value, value: selected?.price ?? form.value })
        }} options={services.map((item) => item.name)} />
        <Select label="Profissional" value={form.professional} onChange={(value) => setForm({ ...form, professional: value })} options={employees.filter((item) => item.active).map((item) => item.name)} />
        <Select label="Forma de pagamento" value={form.paymentMethod} onChange={(value) => setForm({ ...form, paymentMethod: value })} options={['Pix', 'Dinheiro', 'Cartão', 'Pendente']} />
        <Field label="Valor" type="number" value={form.value} onChange={(value) => setForm({ ...form, value })} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button>
          <button className="rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Salvar atendimento</button>
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
        <button type="button" onClick={() => onChange(shiftDate(value, -1))} className="focus-ring rounded-xl border border-blush bg-white px-3 py-2 text-lg font-bold hover:bg-pearl" aria-label="Dia anterior">
          &lt;
        </button>
        <label className="relative block">
          <input
            className="focus-ring h-full w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-center text-sm font-bold text-graphite shadow-sm"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            type="date"
          />
        </label>
        <button type="button" onClick={() => onChange(shiftDate(value, 1))} className="focus-ring rounded-xl border border-blush bg-white px-3 py-2 text-lg font-bold hover:bg-pearl" aria-label="Próximo dia">
          &gt;
        </button>
        <button type="button" onClick={() => onChange(getTodayIso())} className="focus-ring rounded-xl border border-blush bg-pearl px-3 py-2 text-sm font-bold text-graphite hover:bg-blush/40">
          Hoje
        </button>
      </div>
      <p className="mt-2 text-xs font-semibold text-gray-500">Selecionado: {formatDate(value)}</p>
    </div>
  )
}

function AvailabilityPanel({ employee, date, service, availableSlots, occupiedSlots }) {
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

  return (
    <Panel title="Disponibilidade do profissional">
      <div className="space-y-4">
        <div className="rounded-2xl border border-blush bg-pearl p-4 text-sm">
          <p><strong>Profissional:</strong> {employee.name}</p>
          <p className="mt-1"><strong>Data:</strong> {formatDate(date)}</p>
          <p className="mt-1"><strong>Trabalho:</strong> {employee.workStart} às {employee.workEnd}</p>
          <p className="mt-1"><strong>Intervalo:</strong> {employee.breakStart && employee.breakEnd ? `${employee.breakStart} às ${employee.breakEnd}` : 'Sem intervalo cadastrado'}</p>
          <p className="mt-1"><strong>Serviço base:</strong> {service?.name ?? 'Não selecionado'}</p>
        </div>

        {dayOff && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            Este profissional está de folga nesta data
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
                  <p className="mt-1 text-rose-700">Duração: {getAppointmentDuration(appointment, employee)} min · {appointment.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-bold text-graphite">Disponíveis</h4>
          {dayOff ? (
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
        <input className="focus-ring w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm" value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => setFocused(true)} placeholder="Digite o nome da cliente" />
      </label>
      {focused && suggestions.length > 0 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-blush bg-white shadow-soft">
          {suggestions.map((client) => (
            <button key={client.id} type="button" onMouseDown={() => { onChange(client.name); setFocused(false) }} className="block w-full px-4 py-3 text-left text-sm font-semibold hover:bg-pearl">
              <span className="block text-graphite">{client.name}</span>
              <span className="text-xs font-medium text-gray-500">{client.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Clients({ user, clients, setClients, appointments, notify }) {
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

  function saveClient(data) {
    if (!data.name.trim() || !data.phone.trim()) {
      notify?.('Erro ao salvar: informe nome e telefone do cliente.', 'error')
      return
    }
    if (editing) {
      setClients((current) => current.map((client) => client.id === editing.id ? { ...client, ...data } : client))
    } else {
      setClients((current) => [...current, { ...data, id: Date.now(), history: [], lastVisit: 'Novo cadastro', active: true }])
    }
    setModalOpen(false)
    notify?.('Cliente salvo.')
  }

  function toggleClient(client) {
    setClients((current) => current.map((item) => item.id === client.id ? { ...item, active: !item.active } : item))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Clientes cadastrados</h3>
          <p className="text-sm text-gray-500">Admin e Funcionários podem cadastrar e editar clientes.</p>
        </div>
        <button onClick={openNew} className="focus-ring rounded-2xl bg-graphite px-4 py-3 text-sm font-semibold text-white hover:bg-[#343039]">Novo Cliente</button>
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
              <button onClick={() => openEdit(item)} className="rounded-xl border border-blush px-3 py-2 text-sm font-semibold hover:bg-pearl">Editar Cliente</button>
              {canDeactivate && <button onClick={() => toggleClient(item)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">{item.active ? 'Desativar' : 'Ativar'}</button>}
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
        <label className="block"><span className="mb-2 block text-sm font-semibold text-gray-600">Observações</span><textarea className="focus-ring min-h-24 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        {client && canChangeStatus && <Toggle label="Status ativo" checked={form.active} onChange={(checked) => setForm({ ...form, active: checked })} />}
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button><button className="rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Salvar</button></div>
      </form>
    </Modal>
  )
}
function Services({ user, services, setServices, notify }) {
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

  function saveService(data) {
    const payload = {
      ...data,
      name: data.name.trim(),
      price: Number(data.price) || 0
    }
    if (!payload.name) {
      notify?.('Erro ao salvar: informe o nome do serviço.', 'error')
      return
    }
    if (editing) {
      setServices((current) => current.map((item) => item.id === editing.id ? { ...item, ...payload } : item))
    } else {
      setServices((current) => [...current, { ...payload, id: Date.now() }])
    }
    setModalOpen(false)
    notify?.('Serviço salvo com sucesso.')
  }

  function removeService(item) {
    if (!window.confirm(`Remover o serviço "${item.name}"?`)) return
    setServices((current) => current.filter((service) => service.id !== item.id))
    notify?.('Serviço removido.')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Serviços</h3>
          <p className="text-sm text-gray-500">{canManage ? 'Cadastre e ajuste os serviços do Salão.' : 'Consulta dos serviços cadastrados.'}</p>
        </div>
        {canManage && <button onClick={openNew} className="focus-ring whitespace-nowrap rounded-2xl bg-graphite px-4 py-3 text-sm font-semibold text-white hover:bg-[#343039]">Novo Serviço</button>}
      </div>
      <CardsGrid items={services} render={(item) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg font-bold">{item.name}</p>
            <span className="whitespace-nowrap rounded-full bg-blush px-3 py-1 text-sm font-bold">{money.format(item.price)}</span>
          </div>
          <p className="mt-2 text-sm text-gray-600">{item.duration} · {item.category}</p>
          <p className="mt-3 text-sm">Responsável: <strong>{item.professional || 'A definir'}</strong></p>
          {canManage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => openEdit(item)} className="whitespace-nowrap rounded-xl border border-blush px-3 py-2 text-sm font-semibold hover:bg-pearl">Editar</button>
              <button onClick={() => removeService(item)} className="whitespace-nowrap rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Remover</button>
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
    professional: service.professional,
    category: service.category
  } : { name: '', price: 0, duration: '1h', professional: '', category: '' })

  return (
    <Modal title={service ? 'Editar serviço' : 'Novo serviço'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Field label="Nome do serviço" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor" type="number" min="0" value={form.price} onChange={(value) => setForm({ ...form, price: value })} required />
          <Field label="Duração" value={form.duration} onChange={(value) => setForm({ ...form, duration: value })} placeholder="Ex.: 1h 30min" required />
        </div>
        <Field label="Categoria" value={form.category} onChange={(value) => setForm({ ...form, category: value })} required />
        <Field label="Responsável padrão" value={form.professional} onChange={(value) => setForm({ ...form, professional: value })} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="whitespace-nowrap rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button>
          <button className="whitespace-nowrap rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function Employees({ user, employees, setEmployees, salonSettings, onOpenAgendaForProfessional, notify }) {
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

  function saveEmployee(data) {
    const employeeType = data.employeeType ?? 'professional'
    const professional = employeeType === 'professional'
    if (!data.name.trim() || !data.phone.trim() || !data.role.trim()) {
      notify?.('Erro ao salvar: informe nome, telefone e cargo.', 'error')
      return
    }
    if (data.loginActive && (!data.accessEmail.trim() || !data.temporaryPassword.trim())) {
      notify?.('Erro ao salvar: login ativo precisa de e-mail e senha.', 'error')
      return
    }
    const payload = {
      ...data,
      employeeType,
      commission: professional ? Number(data.commission) || 0 : 0,
      defaultDuration: professional ? Number(data.defaultDuration) || 60 : 60,
      scheduleInterval: professional ? Number(data.scheduleInterval) || Number(data.defaultDuration) || 60 : 60,
      workStart: professional ? data.workStart : '',
      workEnd: professional ? data.workEnd : '',
      breakStart: professional ? data.breakStart : '',
      breakEnd: professional ? data.breakEnd : '',
      accessEmail: data.accessEmail,
      temporaryPassword: data.temporaryPassword,
      loginActive: Boolean(data.loginActive),
      serviceCommissions: professional ? (data.serviceCommissions ?? []).map((item, index) => ({
        ...item,
        id: item.id ?? Date.now() + index,
        value: Number(item.value) || 0
      })) : [],
      services: professional ? data.servicesText.split(',').map((item) => item.trim()).filter(Boolean) : []
    }
    delete payload.servicesText
    if (editing) {
      setEmployees((current) => current.map((employee) => employee.id === editing.id ? { ...employee, ...payload } : employee))
    } else {
      setEmployees((current) => [...current, { ...payload, id: Date.now() }])
    }
    setModalOpen(false)
  }

  function toggleEmployee(employee) {
    if (!canManage) return
    setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, active: !item.active } : item))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Equipe do Salão</h3>
          <p className="text-sm text-gray-500">{canManage ? 'Cadastro e edição disponíveis para Admin/Dono.' : 'Funcionário Caixa pode visualizar comissões, sem alterar.'}</p>
        </div>
        {canManage && <button onClick={openNew} className="focus-ring rounded-2xl bg-graphite px-4 py-3 text-sm font-semibold text-white hover:bg-[#343039] sm:shrink-0">Novo Funcionário</button>}
      </div>
      <CardsGrid items={employees} render={(item) => (
        <div className="min-w-0 space-y-3 break-words">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <button onClick={() => isProfessional(item) && onOpenAgendaForProfessional?.(item.name)} className={`min-w-0 whitespace-normal break-words text-left text-lg font-bold leading-snug text-graphite ${isProfessional(item) ? 'hover:text-goldSoft' : 'cursor-default'}`}>
              {item.name}
            </button>
            <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-bold ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
          </div>
          <p className="min-w-0 text-sm text-gray-500">{item.role} · {item.phone}</p>
          <p className="min-w-0 text-sm font-semibold text-gray-600">Tipo: {isProfessional(item) ? 'Profissional' : 'Caixa/Recepção'}</p>
          <p className="min-w-0 text-sm text-gray-600">Login: <strong>{item.loginActive ? 'ativo' : 'inativo'}</strong>{item.accessEmail ? ` · ${item.accessEmail}` : ''}</p>
          <div>
            <span className={`inline-flex max-w-full whitespace-normal break-words rounded-full border px-3 py-1 text-xs font-bold ${employeeStatusStyles[item.workStatus]}`}>
              {item.workStatus}
            </span>
          </div>
          {isProfessional(item) && <p className="min-w-0 text-sm">Comissão padrão: <strong>{item.commission}%</strong></p>}
          {isProfessional(item) && <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-pearl p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm font-bold">Comissões por Serviço</p>
              {canManage && <button onClick={() => openEdit(item)} className="w-fit max-w-full rounded-xl border border-blush px-3 py-2 text-left text-xs font-semibold whitespace-normal hover:bg-white">Adicionar comissão por serviço</button>}
            </div>
            <div className="mt-3 space-y-2">
              {(item.serviceCommissions ?? []).length ? item.serviceCommissions.map((rule) => (
                <div key={rule.id} className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl bg-white px-3 py-2 text-sm dark:bg-[#17141c] lg:flex-row lg:items-center lg:justify-between">
                  <span className="min-w-0 font-semibold break-words">{rule.service}</span>
                  <span className="min-w-0 text-gray-600 break-words dark:text-gray-300">{rule.type === 'fixed' ? 'Valor fixo' : 'Porcentagem'} · {formatCommissionRule(rule)}</span>
                  {canManage && (
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <button onClick={() => openEdit(item)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-50">Editar comissão</button>
                      <button onClick={() => setEmployees((current) => current.map((employee) => employee.id === item.id ? { ...employee, serviceCommissions: (employee.serviceCommissions ?? []).filter((currentRule) => currentRule.id !== rule.id) } : employee))} className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Remover comissão</button>
                    </div>
                  )}
                </div>
              )) : <p className="min-w-0 text-sm text-gray-500">Sem comissão específica. Usa a comissão padrão.</p>}
            </div>
          </div>}
          {isProfessional(item) && <p className="min-w-0 text-sm text-gray-600">Serviços: {(item.services ?? []).join(', ')}</p>}
          {isProfessional(item) && <p className="min-w-0 text-sm text-gray-600">
            Expediente: <strong>{item.workStart} às {item.workEnd}</strong>
            {item.breakStart && item.breakEnd ? ` · intervalo ${item.breakStart} às ${item.breakEnd}` : ''}
          </p>}
          {isProfessional(item) && <p className="min-w-0 text-sm text-gray-600">Duração padrão: {item.defaultDuration} min</p>}
          {isProfessional(item) && <p className="min-w-0 text-sm text-gray-600">Intervalo da agenda: {item.scheduleInterval} min</p>}
          {canManage && <div className="mt-4 flex min-w-0 flex-wrap gap-2"><button onClick={() => openEdit(item)} className="rounded-xl border border-blush px-3 py-2 text-sm font-semibold hover:bg-pearl">Editar</button><button onClick={() => toggleEmployee(item)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">{item.active ? 'Desativar' : 'Ativar'}</button></div>}
        </div>
      )} />
      {modalOpen && <EmployeeModal employee={editing} salonSettings={salonSettings} onClose={() => setModalOpen(false)} onSave={saveEmployee} />}
    </div>
  )
}

function EmployeeModal({ employee, salonSettings, onClose, onSave }) {
  const defaultEmployeeType = employee?.employeeType ?? 'professional'
  const defaultAccessEmail = employee?.accessEmail ?? getSuggestedAccessEmail({ name: employee?.name, employeeType: defaultEmployeeType, salonSettings })
  const [form, setForm] = useState(employee ? {
    ...employee,
    employeeType: defaultEmployeeType,
    workStatus: employee.workStatus ?? 'Ativo',
    workStart: employee.workStart ?? (employee.employeeType === 'cashier' ? '' : '09:00'),
    workEnd: employee.workEnd ?? (employee.employeeType === 'cashier' ? '' : '18:00'),
    breakStart: employee.breakStart ?? '',
    breakEnd: employee.breakEnd ?? '',
    accessEmail: defaultAccessEmail,
    temporaryPassword: employee.temporaryPassword ?? '',
    loginActive: employee.loginActive ?? false,
    defaultDuration: employee.defaultDuration ?? 60,
    scheduleInterval: employee.scheduleInterval ?? employee.defaultDuration ?? 60,
    serviceCommissions: employee.serviceCommissions ?? [],
    servicesText: (employee.services ?? []).join(', ')
  } : { name: '', phone: '', role: '', employeeType: 'professional', accessEmail: getSuggestedAccessEmail({ employeeType: 'professional', salonSettings }), temporaryPassword: '', loginActive: false, commission: 30, serviceCommissions: [], servicesText: '', active: true, workStatus: 'Ativo', workStart: '09:00', workEnd: '18:00', breakStart: '', breakEnd: '', defaultDuration: 60, scheduleInterval: 60 })
  const professional = form.employeeType === 'professional'
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
    setForm((current) => ({
      ...current,
      employeeType,
      role: employeeType === 'cashier' ? 'Caixa/Recepção' : current.role,
      accessEmail: !current.accessEmail || current.accessEmail === previousSuggestion
        ? getSuggestedAccessEmail({ name: current.name, employeeType, salonSettings })
        : current.accessEmail
    }))
  }

  function generateLogin() {
    setForm((current) => ({
      ...current,
      accessEmail: getSuggestedAccessEmail({ name: current.name, employeeType: current.employeeType, salonSettings }),
      temporaryPassword: current.temporaryPassword || String(Math.floor(100000 + Math.random() * 900000)),
      loginActive: true
    }))
  }

  function addServiceCommission() {
    setForm((current) => ({
      ...current,
      serviceCommissions: [...(current.serviceCommissions ?? []), { id: Date.now(), service: services[0]?.name ?? '', type: 'percentage', value: 0 }]
    }))
  }

  function updateServiceCommission(id, changes) {
    setForm((current) => ({
      ...current,
      serviceCommissions: (current.serviceCommissions ?? []).map((item) => item.id === id ? { ...item, ...changes } : item)
    }))
  }

  function removeServiceCommission(id) {
    setForm((current) => ({
      ...current,
      serviceCommissions: (current.serviceCommissions ?? []).filter((item) => item.id !== id)
    }))
  }

  return (
    <Modal title={employee ? 'Editar Funcionário' : 'Novo Funcionário'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form) }} className="space-y-3">
        <Field label="Nome" value={form.name} onChange={updateName} required />
        <Field label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required />
        <Field label="Cargo" value={form.role} onChange={(value) => setForm({ ...form, role: value })} required />
        <Select label="Tipo de Funcionário" value={form.employeeType} onChange={updateEmployeeType} options={['Profissional', 'Caixa/Recepção']} values={['professional', 'cashier']} />
        <section className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-bold">Login do Funcionário</h4>
              <p className="text-sm text-gray-500">Sugestão: {suggestedAccessEmail}</p>
            </div>
            <button type="button" onClick={generateLogin} className="rounded-xl border border-blush px-3 py-2 text-sm font-semibold hover:bg-pearl">Usar sugestão</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="E-mail de acesso" value={form.accessEmail ?? ''} onChange={(value) => setForm({ ...form, accessEmail: value })} type="email" />
            <Field label="Senha temporária" value={form.temporaryPassword ?? ''} onChange={(value) => setForm({ ...form, temporaryPassword: value })} />
          </div>
          <div className="mt-3">
            <Toggle label={`Status do login: ${form.loginActive ? 'ativo' : 'inativo'}`} checked={Boolean(form.loginActive)} onChange={(checked) => setForm({ ...form, loginActive: checked })} />
          </div>
        </section>
        {professional && <Field label="Comissão padrão (%)" type="number" value={form.commission} onChange={(value) => setForm({ ...form, commission: value })} />}
        {professional && <Field label="Serviços que realiza" value={form.servicesText} onChange={(value) => setForm({ ...form, servicesText: value })} placeholder="Separar por vírgula" />}
        {professional && <section className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-bold">Comissões por Serviço</h4>
              <p className="text-sm text-gray-500">Quando não houver regra específica, o sistema usa a comissão padrão.</p>
            </div>
            <button type="button" onClick={addServiceCommission} className="rounded-xl border border-blush px-3 py-2 text-sm font-semibold hover:bg-pearl">Adicionar comissão por serviço</button>
          </div>
          <div className="mt-4 space-y-3">
            {(form.serviceCommissions ?? []).map((rule) => (
              <div key={rule.id} className="grid gap-3 rounded-2xl bg-pearl p-3 dark:bg-white/5 md:grid-cols-[1.2fr_0.8fr_0.7fr_auto]">
                <Select label="Serviço" value={rule.service} onChange={(value) => updateServiceCommission(rule.id, { service: value })} options={services.map((item) => item.name)} />
                <Select label="Tipo de comissão" value={rule.type} onChange={(value) => updateServiceCommission(rule.id, { type: value })} options={['Porcentagem', 'Valor fixo']} values={['percentage', 'fixed']} />
                <Field label={rule.type === 'fixed' ? 'Valor fixo' : 'Porcentagem'} type="number" value={rule.value} onChange={(value) => updateServiceCommission(rule.id, { value })} />
                <div className="flex items-end">
                  <button type="button" onClick={() => removeServiceCommission(rule.id)} className="w-full rounded-xl border border-rose-200 px-3 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">Remover comissão</button>
                </div>
              </div>
            ))}
            {(form.serviceCommissions ?? []).length === 0 && <p className="rounded-2xl bg-pearl px-4 py-3 text-sm font-semibold text-gray-500 dark:bg-white/5">Nenhuma comissão específica cadastrada.</p>}
          </div>
        </section>}
        {professional && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Horário de início" type="time" value={form.workStart} onChange={(value) => setForm({ ...form, workStart: value })} />
          <Field label="Horário de fim" type="time" value={form.workEnd} onChange={(value) => setForm({ ...form, workEnd: value })} />
          <Field label="Início do intervalo" type="time" value={form.breakStart} onChange={(value) => setForm({ ...form, breakStart: value })} />
          <Field label="Fim do intervalo" type="time" value={form.breakEnd} onChange={(value) => setForm({ ...form, breakEnd: value })} />
        </div>}
        {professional && <Field label="Duração padrão dos serviços (min)" type="number" value={form.defaultDuration} onChange={(value) => setForm({ ...form, defaultDuration: value })} />}
        {professional && <Field label="Intervalo da agenda (min)" type="number" value={form.scheduleInterval} onChange={(value) => setForm({ ...form, scheduleInterval: value })} />}
        <Select label="Status atual" value={form.workStatus} onChange={(value) => setForm({ ...form, workStatus: value })} options={employeeStatuses} />
        <Toggle label="Status ativo" checked={form.active} onChange={(checked) => setForm({ ...form, active: checked })} />
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button><button className="rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Salvar</button></div>
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
        <Metric title="Pix" value={money.format(byMethod('Pix'))} detail="Recebido hoje" />
        <Metric title="Dinheiro" value={money.format(byMethod('Dinheiro'))} detail="Recebido hoje" />
        <Metric title="Cartão" value={money.format(byMethod('Cartão'))} detail="Recebido hoje" />
        <Metric title="Pendente" value={money.format(byMethod('Pendente'))} detail="A receber" />
        <Metric title="Saídas" value={money.format(outcome)} detail="Hoje" />
        <Metric title="Saldo final" value={money.format(income - outcome)} detail="Entradas - saídas" />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => setModalOpen(true)} className="focus-ring whitespace-nowrap rounded-2xl border border-blush px-4 py-3 text-sm font-bold hover:bg-pearl">Nova movimentação</button>
        <button onClick={closeDay} className="focus-ring whitespace-nowrap rounded-2xl bg-graphite px-4 py-3 text-sm font-bold text-white">Fechar caixa do dia</button>
      </div>
      <Panel title="Movimentações do caixa">
        <Table
          rows={todayEntries}
          columns={['date', 'description', 'type', 'category', 'value']}
          labels={['Data', 'Descrição', 'Tipo', 'Categoria', 'Valor']}
          formatValue={(key, value, row) => {
            if (key === 'date') return formatDate(row.date ?? row.data ?? todayIso)
            if (key === 'description') return cashDescription(row)
            if (key === 'type') return cashType(row) === 'entrada' ? 'Entrada' : 'Saída'
            if (key === 'category') return cashCategory(row) || '-'
            if (key === 'value') return money.format(cashValue(row))
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
          <button type="button" onClick={onClose} className="whitespace-nowrap rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button>
          <button className="whitespace-nowrap rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Salvar</button>
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
        <button onClick={openNew} className="focus-ring rounded-2xl bg-graphite px-4 py-3 text-sm font-semibold text-white hover:bg-[#343039]">Novo Vale</button>
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
            <button onClick={() => openEdit(item)} className="rounded-xl border border-blush px-3 py-2 text-sm font-semibold hover:bg-pearl">Editar</button>
            {item.status !== 'Descontado' && <button onClick={() => markDiscounted(item)} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Marcar descontado</button>}
            {canDelete && <button onClick={() => removeAdvance(item)} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Excluir</button>}
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
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button>
          <button className="rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Salvar</button>
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
        {canManage && <button onClick={openNew} className="focus-ring rounded-2xl bg-graphite px-4 py-3 text-sm font-semibold text-white hover:bg-[#343039]">Novo Produto</button>}
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
              <button onClick={() => openEdit(item)} className="rounded-xl border border-blush px-3 py-2 text-sm font-semibold hover:bg-pearl">Editar</button>
              <button onClick={() => removeProduct(item)} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Remover</button>
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
          <input type="file" accept="image/*" onChange={handleImage} className="focus-ring w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm" />
        </label>
        {form.imageUrl && <img src={form.imageUrl} alt="Prévia do produto" className="h-28 w-28 rounded-2xl border border-gray-200 object-cover" />}
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-600">Observações</span>
          <textarea className="focus-ring min-h-24 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button>
          <button className="rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

function Reports({ appointments, employees, user }) {
  const professionals = getProfessionals(employees)
  const visible = user.role === 'admin' ? appointments : appointments.filter((item) => item.professional === user.name)
  const completed = visible.filter((item) => item.status === 'Concluído')
  const commissions = completed.reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0)
  const employeeCommissions = professionals
    .map((employee) => ({
      name: employee.name,
      value: completed.filter((item) => item.professional === employee.name).reduce((sum, item) => sum + getAppointmentCommission(item, employees), 0)
    }))
    .filter((item) => user.role === 'admin' || item.name === user.name)
  const serviceCommissions = topEntries(completed.reduce((acc, item) => ({ ...acc, [item.service]: (acc[item.service] || 0) + getAppointmentCommission(item, employees) }), {}), 8)
  const serviceSales = topEntries(countBy(completed, (item) => item.service))
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {user.role === 'admin' && <Panel title="Faturamento por período"><CompactList items={[`Mês atual: ${money.format(completed.reduce((sum, item) => sum + Number(item.value ?? 0), 0))}`, `Ticket médio: ${money.format(completed.length ? completed.reduce((sum, item) => sum + Number(item.value ?? 0), 0) / completed.length : 0)}`]} /></Panel>}
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
  const [date, setDate] = useState(todayIso)
  const [view, setView] = useState('day')
  const [serviceName, setServiceName] = useState(employee?.services?.[0] ?? services[0]?.name ?? '')
  const [selectedSlot, setSelectedSlot] = useState(null)

  if (!employee) return <AccessDenied />

  const selectedService = services.find((item) => item.name === serviceName)
  const weekDates = getWeekDates(date)
  const dayAppointments = appointments.filter((item) => item.date === date)
  const weekAppointments = appointments.filter((item) => weekDates.includes(item.date))
  const availableSlots = getAvailableSlots({ employee, date, service: selectedService, appointments, blockedSlots })
  const occupiedSlots = getOccupiedSlots({ employee, date, appointments })
  const serviceOptions = employee.services?.length ? employee.services : services.filter((item) => item.professional === employee.name).map((item) => item.name)

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
              {dayAppointments.map((item) => <LineItem key={item.id} label={`${item.time} · ${item.client} · ${item.service}`} value={item.status} />)}
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

      <AvailabilityPanel employee={employee} date={date} service={selectedService} availableSlots={availableSlots} occupiedSlots={occupiedSlots} />
      {selectedSlot && <ScheduleRequestModal employee={employee} slot={selectedSlot} date={date} serviceName={serviceName} onClose={() => setSelectedSlot(null)} onSubmit={requestSlot} />}
    </div>
  )
}

function ScheduleRequestModal({ employee, slot, date, serviceName, onClose, onSubmit }) {
  const [form, setForm] = useState({ client: '', phone: '', service: serviceName, notes: '' })

  return (
    <Modal title="Solicitar agendamento" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(form) }} className="space-y-3">
        <div className="rounded-2xl border border-blush bg-pearl px-4 py-3 text-sm font-semibold text-gray-700">
          {employee.name} · {formatDate(date)} · {slot}
        </div>
        <Field label="Nome da cliente" value={form.client} onChange={(value) => setForm({ ...form, client: value })} required />
        <Field label="Telefone da cliente (opcional)" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <Select label="Serviço desejado" value={form.service} onChange={(value) => setForm({ ...form, service: value })} options={employee.services?.length ? employee.services : services.map((item) => item.name)} />
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-600">Observação (opcional)</span>
          <textarea className="focus-ring min-h-24 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-graphite shadow-sm" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 font-semibold">Cancelar</button>
          <button className="rounded-xl bg-graphite px-4 py-2 font-semibold text-white">Enviar pelo WhatsApp</button>
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
        <Metric title="Concluídos" value={appointments.filter((item) => item.status === 'Concluído').length} detail="Sem valores financeiros" />
        <Metric title="Confirmados" value={appointments.filter((item) => item.status === 'Confirmado').length} detail="Próximos Horários" />
        <Metric title="Minha Comissão" value={money.format(appointments.filter((item) => item.status === 'Concluído').reduce((sum, item) => sum + Number(item.comissaoCalculada ?? item.commission ?? 0), 0))} detail="Atendimentos concluídos" />
      </div>
      <Panel title="Meus atendimentos">
        <div className="space-y-3">
          {appointments.map((item) => <LineItem key={item.id} label={`${formatDate(item.date)} · ${item.time} · ${item.client}`} value={item.status} />)}
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

function Settings({ settings, setSettings }) {
  const adminEmail = getSuggestedAccessEmail({ employeeType: 'admin', salonSettings: settings })
  const cashierEmail = getSuggestedAccessEmail({ employeeType: 'cashier', salonSettings: settings })

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Dados do Salão">
        <div className="space-y-3">
          <Field label="Nome do Salão" value={settings.salonName ?? ''} onChange={(value) => setSettings((current) => ({ ...current, salonName: value }))} />
          <CompactList items={[`Login Admin sugerido: ${adminEmail}`, `Login Caixa sugerido: ${cashierEmail}`, 'Horários definidos por Funcionário', 'Moeda: Real brasileiro']} />
          <Field label="WhatsApp da recepção/caixa" value={settings.receptionWhatsapp} onChange={(value) => setSettings((current) => ({ ...current, receptionWhatsapp: value }))} placeholder="Ex.: 5511999999999" />
        </div>
      </Panel>
      <Panel title="Preferências">
        <CompactList items={['Alertas de estoque baixo ativos', 'Agenda visível por perfil', 'Dados mockados nesta primeira versão']} />
      </Panel>
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
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/10">Fechar</button>
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
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold dark:border-white/10">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#c9a85d]" />
    </label>
  )
}
function Metric({ title, value, detail }) {
  return (
    <div className="rounded-2xl border border-blush/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]">
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-2xl font-bold text-graphite dark:text-gray-100">{value}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl border border-blush/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]">
      <h3 className="mb-4 text-lg font-bold text-graphite dark:text-gray-100">{title}</h3>
      {children}
    </section>
  )
}

function Select({ label, value, onChange, options, values, disabled = false }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">{label}</span>
      <select disabled={disabled} className="focus-ring w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 disabled:bg-gray-100 dark:border-white/10 dark:bg-[#17141c] dark:text-gray-100 dark:disabled:bg-white/5" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option, index) => <option key={values?.[index] ?? option} value={values?.[index] ?? option}>{option}</option>)}
      </select>
    </label>
  )
}

function CardsGrid({ items, render }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.id} className="min-w-0 overflow-hidden rounded-2xl border border-blush/70 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-[#1f1b26]">
          {render(item)}
        </article>
      ))}
    </div>
  )
}

function CompactList({ items }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
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




