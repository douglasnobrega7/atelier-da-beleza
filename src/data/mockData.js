export const employees = [
  { id: 1, employeeType: 'professional', name: 'Camila Rocha', phone: '(11) 97777-2020', role: 'Manicure', accessEmail: 'camila@atelierdabeleza.com', temporaryPassword: '', loginActive: false, commission: 35, serviceCommissions: [{ id: 101, service: 'Manicure gel', type: 'percentage', value: 50 }, { id: 102, service: 'Pedicure spa', type: 'percentage', value: 45 }], services: ['Manicure gel', 'Pedicure spa', 'Sobrancelha'], active: true, workStatus: 'Ativo', workStart: '09:00', workEnd: '18:00', breakStart: '12:00', breakEnd: '13:00', defaultDuration: 60, scheduleInterval: 60 },
  { id: 2, employeeType: 'professional', name: 'Livia Moreira', phone: '(11) 96666-3030', role: 'Cabeleireira', commission: 40, serviceCommissions: [{ id: 201, service: 'Escova modelada', type: 'percentage', value: 40 }, { id: 202, service: 'Coloração', type: 'percentage', value: 35 }], services: ['Corte feminino', 'Escova modelada', 'Coloração'], active: true, workStatus: 'Horário de almoço', workStart: '08:00', workEnd: '17:00', breakStart: '12:00', breakEnd: '13:00', defaultDuration: 50, scheduleInterval: 30 },
  { id: 3, employeeType: 'professional', name: 'Bianca Reis', phone: '(11) 95555-4040', role: 'Esteticista', commission: 38, serviceCommissions: [{ id: 301, service: 'Design de sobrancelhas', type: 'fixed', value: 10 }], services: ['Limpeza de pele', 'Design de sobrancelhas'], active: true, workStatus: 'De folga', workStart: '10:00', workEnd: '19:00', breakStart: '14:00', breakEnd: '15:00', defaultDuration: 60, scheduleInterval: 30 },
  { id: 4, employeeType: 'professional', name: 'Renata Lima', phone: '(11) 94444-5050', role: 'Maquiadora', commission: 42, serviceCommissions: [], services: ['Maquiagem social', 'Penteado'], active: false, workStatus: 'De folga', workStart: '11:00', workEnd: '20:00', breakStart: '', breakEnd: '', defaultDuration: 90, scheduleInterval: 30 },
  { id: 5, employeeType: 'cashier', name: 'Rafaela Costa', phone: '(11) 98888-9090', role: 'Caixa/Recepção', commission: 0, serviceCommissions: [], services: [], active: true, workStatus: 'Ativo', workStart: '', workEnd: '', breakStart: '', breakEnd: '', defaultDuration: 60, scheduleInterval: 60 }
]

export const services = [
  { id: 1, name: 'Corte feminino', price: 90, duration: '50 min', commission_percent: 40, responsible: '', category: 'Cabeleireiro/Cabeleireira, Barbeiro/Barbeira' },
  { id: 2, name: 'Escova modelada', price: 75, duration: '45 min', commission_percent: 40, responsible: '', category: 'Cabeleireiro/Cabeleireira' },
  { id: 3, name: 'Coloração', price: 220, duration: '2h 30min', commission_percent: 35, responsible: '', category: 'Colorista' },
  { id: 4, name: 'Manicure gel', price: 70, duration: '1h', commission_percent: 50, responsible: '', category: 'Manicure e Pedicure' },
  { id: 5, name: 'Pedicure spa', price: 85, duration: '1h 10min', commission_percent: 45, responsible: '', category: 'Manicure e Pedicure' },
  { id: 6, name: 'Design de sobrancelhas', price: 55, duration: '35 min', commission_percent: 40, responsible: '', category: 'Designer de Sobrancelhas / Micropigmentador' },
  { id: 7, name: 'Limpeza de pele', price: 160, duration: '1h 20min', commission_percent: 38, responsible: '', category: 'Esteticista' },
  { id: 8, name: 'Maquiagem social', price: 180, duration: '1h 30min', commission_percent: 42, responsible: '', category: 'Maquiador/Maquiadora' }
]

export const clients = [
  { id: 1, name: 'Ana Paula Martins', phone: '(11) 91234-1111', birthday: '12/03', notes: 'Prefere horários pela manhã.', history: ['Corte feminino', 'Escova modelada'], lastVisit: '26/04/2026' },
  { id: 2, name: 'Juliana Nunes', phone: '(11) 92345-2222', birthday: '28/07', notes: 'Alergia a esmalte comum.', history: ['Manicure gel', 'Pedicure spa'], lastVisit: '25/04/2026' },
  { id: 3, name: 'Carla Mendes', phone: '(11) 93456-3333', birthday: '09/10', notes: 'Gosta de tons claros.', history: ['Coloração', 'Design de sobrancelhas'], lastVisit: '22/04/2026' },
  { id: 4, name: 'Patricia Souza', phone: '(11) 94567-4444', birthday: '17/01', notes: 'Cliente recorrente quinzenal.', history: ['Limpeza de pele'], lastVisit: '18/04/2026' },
  { id: 5, name: 'Fernanda Alves', phone: '(11) 95678-5555', birthday: '03/12', notes: 'Pagamento geralmente via Pix.', history: ['Maquiagem social', 'Penteado'], lastVisit: '14/04/2026' }
]

export const appointments = [
  { id: 1, client: 'Ana Paula Martins', service: 'Corte feminino', employee_id: 2, employee_name: 'Livia Moreira', date: '2026-04-27', time: '08:30', value: 90, status: 'Confirmado' },
  { id: 2, client: 'Juliana Nunes', service: 'Manicure gel', employee_id: 1, employee_name: 'Camila Rocha', date: '2026-04-27', time: '09:00', value: 70, status: 'Aguardando' },
  { id: 3, client: 'Carla Mendes', service: 'Coloração', employee_id: 2, employee_name: 'Livia Moreira', date: '2026-04-27', time: '10:30', value: 220, status: 'Confirmado' },
  { id: 4, client: 'Patricia Souza', service: 'Limpeza de pele', employee_id: 3, employee_name: 'Bianca Reis', date: '2026-04-27', time: '13:00', value: 160, status: 'Concluído' },
  { id: 5, client: 'Fernanda Alves', service: 'Maquiagem social', employee_id: 4, employee_name: 'Renata Lima', date: '2026-04-27', time: '15:30', value: 180, status: 'Cancelado' },
  { id: 6, client: 'Juliana Nunes', service: 'Pedicure spa', employee_id: 1, employee_name: 'Camila Rocha', date: '2026-04-28', time: '14:00', value: 85, status: 'Confirmado' }
]

export const cashFlow = [
  { id: 1, type: 'Entrada', description: 'Corte Ana Paula', method: 'Pix', value: 90 },
  { id: 2, type: 'Entrada', description: 'Limpeza de pele Patricia', method: 'Cartão', value: 160 },
  { id: 3, type: 'Saída', description: 'Reposição de esmaltes', method: 'Dinheiro', value: 130 },
  { id: 4, type: 'Entrada', description: 'Manicure Juliana', method: 'Pendente', value: 70 },
  { id: 5, type: 'Saída', description: 'Material descartável', method: 'Pix', value: 65 }
]

export const advances = [
  { id: 1, employee: 'Camila Rocha', value: 120, date: '2026-04-27', status: 'Aberto', reason: 'Adiantamento semanal' },
  { id: 2, employee: 'Livia Moreira', value: 80, date: '2026-04-26', status: 'Descontado', reason: 'Vale transporte' }
]

export const inventory = [
  { id: 1, name: 'Shampoo tratamento', product: 'Shampoo tratamento', category: 'Cabelo', quantity: 8, unit: 'litro', min: 5, cost: 38, supplier: 'Bella Cosméticos', notes: 'Uso no lavatório.' },
  { id: 2, name: 'Esmalte nude', product: 'Esmalte nude', category: 'Unhas', quantity: 3, unit: 'unidade', min: 6, cost: 9, supplier: 'Distribuidora Rosa', notes: 'Cor mais usada em manicure gel.' },
  { id: 3, name: 'Algodão profissional', product: 'Algodão profissional', category: 'Descartáveis', quantity: 12, unit: 'caixa', min: 4, cost: 14, supplier: 'Higiene Pro', notes: '' },
  { id: 4, name: 'Coloração loiro 8.0', product: 'Coloração loiro 8.0', category: 'Coloração', quantity: 4, unit: 'unidade', min: 5, cost: 32, supplier: 'Bella Cosméticos', notes: 'Reposição prioritária.' },
  { id: 5, name: 'Removedor sem acetona', product: 'Removedor sem acetona', category: 'Unhas', quantity: 2, unit: 'ml', min: 4, cost: 18, supplier: 'Distribuidora Rosa', notes: '' }
]

export const weeklyRevenue = [
  { day: 'Seg', value: 780 },
  { day: 'Ter', value: 920 },
  { day: 'Qua', value: 680 },
  { day: 'Qui', value: 1160 },
  { day: 'Sex', value: 1480 },
  { day: 'Sab', value: 1720 },
  { day: 'Dom', value: 320 }
]


