alter table if exists public.advances
  add column if not exists employee_id bigint,
  add column if not exists employee_name text,
  add column if not exists amount numeric not null default 0,
  add column if not exists value numeric not null default 0,
  add column if not exists status text not null default 'pendente',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists discounted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists notes text;

do $$
begin
  if to_regclass('public.advances') is not null then
    update public.advances
    set amount = coalesce(nullif(amount, 0), value, 0),
        created_at = coalesce(created_at, now()),
        status = case
          when lower(coalesce(status, '')) = 'descontado' then 'descontado'
          when lower(coalesce(status, '')) = 'cancelado' then 'cancelado'
          else 'pendente'
        end
    where true;
  end if;
end $$;

alter table if exists public.advances
  add column if not exists cancelled_reason text;

alter table if exists public.employee_commission_payments
  add column if not exists commission_gross numeric not null default 0,
  add column if not exists advances_total numeric not null default 0,
  add column if not exists advance_ids bigint[] not null default '{}';

do $$
begin
  if to_regclass('public.employee_commission_payments') is not null then
    update public.employee_commission_payments
    set commission_gross = amount
    where commission_gross = 0;
  end if;
end $$;

create index if not exists advances_salon_employee_status_created
  on public.advances (salon_id, employee_id, status, created_at desc);
