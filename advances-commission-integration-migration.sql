alter table if exists public.advances
  add column if not exists employee_id bigint,
  add column if not exists employee_name text,
  add column if not exists value numeric not null default 0,
  add column if not exists status text not null default 'pendente',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists discounted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists notes text;

update public.advances
set created_at = coalesce(created_at, now()),
    status = case
      when lower(coalesce(status, '')) = 'descontado' then 'descontado'
      when lower(coalesce(status, '')) = 'cancelado' then 'cancelado'
      else 'pendente'
    end
where true;

alter table public.advances
  drop column if exists employee,
  drop column if exists reason,
  drop column if exists date,
  drop column if exists paid_at;

alter table if exists public.commission_payments
  add column if not exists commission_gross numeric not null default 0,
  add column if not exists advances_total numeric not null default 0,
  add column if not exists advance_ids bigint[] not null default '{}';

update public.commission_payments
set commission_gross = amount
where commission_gross = 0;

create index if not exists advances_salon_employee_status_created
  on public.advances (salon_id, employee_id, status, created_at desc);
