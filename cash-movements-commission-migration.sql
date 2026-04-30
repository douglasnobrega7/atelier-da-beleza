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
  add column if not exists status text not null default 'concluido',
  add column if not exists referencia_id bigint,
  add column if not exists referencia_tipo text;

create unique index if not exists cash_movements_unique_appointment
  on public.cash_movements (salon_id, appointment_id)
  where appointment_id is not null;
