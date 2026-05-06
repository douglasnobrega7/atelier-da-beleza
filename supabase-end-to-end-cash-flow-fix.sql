-- Correcao ponta a ponta do fluxo de recebimento, caixa, comissoes e auditoria.
-- Versao compativel com a base atual do projeto Supabase, que usa UUIDs.
-- Idempotente: pode ser executada mais de uma vez no Supabase SQL Editor.

alter table public.cash_movements
  add column if not exists discount numeric(10,2) not null default 0,
  add column if not exists notes text,
  add column if not exists observacao text,
  add column if not exists updated_at timestamp,
  add column if not exists cancelled_reason text,
  add column if not exists commission_paid boolean not null default false,
  add column if not exists commission_paid_at timestamp,
  add column if not exists commission_payment_method text,
  add column if not exists commission_notes text;

update public.cash_movements
set
  amount = coalesce(nullif(amount, 0), nullif(service_value, 0), value, 0),
  service_value = coalesce(nullif(service_value, 0), amount, value, 0),
  discount = coalesce(discount, desconto, 0),
  desconto = coalesce(desconto, discount, 0),
  payment_status = coalesce(payment_status, status, 'pago'),
  notes = coalesce(notes, observacao, ''),
  observacao = coalesce(observacao, notes, ''),
  updated_at = coalesce(updated_at, created_at::timestamp)
where true;

create unique index if not exists cash_movements_unique_appointment
  on public.cash_movements (salon_id, appointment_id)
  where appointment_id is not null;

create index if not exists cash_movements_salon_date_idx
  on public.cash_movements (salon_id, date desc);

alter table public.cash_closures
  add column if not exists salon_id uuid,
  add column if not exists date date not null default current_date,
  add column if not exists total_received numeric(10,2) not null default 0,
  add column if not exists pix_total numeric(10,2) not null default 0,
  add column if not exists cash_total numeric(10,2) not null default 0,
  add column if not exists debit_total numeric(10,2) not null default 0,
  add column if not exists credit_total numeric(10,2) not null default 0,
  add column if not exists pending_total numeric(10,2) not null default 0,
  add column if not exists outcome_total numeric(10,2) not null default 0,
  add column if not exists commission_total numeric(10,2) not null default 0,
  add column if not exists salon_profit numeric(10,2) not null default 0,
  add column if not exists final_balance numeric(10,2) not null default 0,
  add column if not exists notes text,
  add column if not exists observacao text;

create unique index if not exists cash_closures_unique_day
  on public.cash_closures (salon_id, date)
  where salon_id is not null;

create index if not exists cash_closures_salon_date_idx
  on public.cash_closures (salon_id, date desc);

alter table public.employee_commission_payments
  add column if not exists commission_gross numeric(10,2) not null default 0,
  add column if not exists advances_total numeric(10,2) not null default 0,
  add column if not exists cash_movement_ids uuid[] not null default '{}',
  add column if not exists advance_ids uuid[] not null default '{}';

update public.employee_commission_payments
set commission_gross = coalesce(nullif(commission_gross, 0), amount, 0)
where true;

create index if not exists employee_commission_payments_salon_paid_at
  on public.employee_commission_payments (salon_id, paid_at desc);

alter table public.appointments
  add column if not exists payment_status text not null default 'pendente',
  add column if not exists payment_method text;

alter table public.cash_movements enable row level security;
alter table public.cash_closures enable row level security;
alter table public.employee_commission_payments enable row level security;
alter table public.audit_logs enable row level security;

grant select, insert, update, delete on public.cash_movements to authenticated;
grant select, insert, update, delete on public.cash_closures to authenticated;
grant select, insert, update, delete on public.employee_commission_payments to authenticated;
grant select, insert, update, delete on public.audit_logs to authenticated;

drop policy if exists cash_movements_all on public.cash_movements;
drop policy if exists "authenticated can insert audit logs" on public.audit_logs;
drop policy if exists "authenticated can read own/allowed audit logs" on public.audit_logs;

drop policy if exists cash_movements_por_salao on public.cash_movements;
drop policy if exists cash_closures_por_salao on public.cash_closures;
drop policy if exists employee_commission_payments_por_salao on public.employee_commission_payments;
drop policy if exists audit_logs_por_salao on public.audit_logs;

create policy cash_movements_por_salao on public.cash_movements
  for all
  using (salon_id in (select salon_id from public.users where id = (select auth.uid())))
  with check (salon_id in (select salon_id from public.users where id = (select auth.uid())));

create policy cash_closures_por_salao on public.cash_closures
  for all
  using (salon_id in (select salon_id from public.users where id = (select auth.uid())))
  with check (salon_id in (select salon_id from public.users where id = (select auth.uid())));

create policy employee_commission_payments_por_salao on public.employee_commission_payments
  for all
  using (salon_id in (select salon_id from public.users where id = (select auth.uid())))
  with check (salon_id in (select salon_id from public.users where id = (select auth.uid())));

create policy audit_logs_por_salao on public.audit_logs
  for all
  using (salon_id in (select salon_id from public.users where id = (select auth.uid())))
  with check (salon_id in (select salon_id from public.users where id = (select auth.uid())));

notify pgrst, 'reload schema';
