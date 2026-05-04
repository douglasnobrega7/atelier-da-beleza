alter table public.cash_movements
  add column if not exists service_value numeric not null default 0,
  add column if not exists commission_percent numeric not null default 0,
  add column if not exists commission_value numeric not null default 0,
  add column if not exists salon_value numeric not null default 0,
  add column if not exists employee_id bigint,
  add column if not exists service_id bigint,
  add column if not exists appointment_id bigint,
  add column if not exists client_name text,
  add column if not exists service_name text,
  add column if not exists employee_name text,
  add column if not exists status text not null default 'pago',
  add column if not exists payment_status text not null default 'pago',
  add column if not exists payment_method text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists commission_paid boolean not null default false,
  add column if not exists commission_paid_at timestamptz,
  add column if not exists commission_payment_method text,
  add column if not exists commission_notes text;

alter table public.cash_movements
  drop column if exists forma_pagamento,
  drop column if exists method,
  drop column if exists referencia_id,
  drop column if exists referencia_tipo;

create unique index if not exists cash_movements_unique_appointment
  on public.cash_movements (salon_id, appointment_id)
  where appointment_id is not null;
