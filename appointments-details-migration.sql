alter table public.appointments
  add column if not exists duration integer not null default 60,
  add column if not exists service_name text,
  add column if not exists service_id bigint,
  add column if not exists employee_id bigint,
  add column if not exists payment_status text not null default 'pendente',
  add column if not exists payment_method text;
