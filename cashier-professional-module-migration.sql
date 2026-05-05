-- Modulo caixa profissional / multi-salao.
-- Este projeto usa tabelas em ingles no frontend: employees, cash_movements e cash_closures.
-- As colunas tipo_usuario/funcoes tambem sao criadas como aliases de compatibilidade.

alter table if exists public.employees
  add column if not exists employee_type text default 'professional',
  add column if not exists tipo_usuario text default 'profissional',
  add column if not exists functions text,
  add column if not exists funcoes text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('admin', 'caixa', 'profissional', 'cashier', 'professional'));
  end if;
end $$;

update public.employees
set
  employee_type = case
    when lower(coalesce(tipo_usuario, employee_type, role, '')) in ('caixa', 'cashier') then 'cashier'
    when lower(coalesce(tipo_usuario, employee_type, role, '')) = 'admin' then 'admin'
    else 'professional'
  end,
  tipo_usuario = case
    when lower(coalesce(tipo_usuario, employee_type, role, '')) in ('caixa', 'cashier') then 'caixa'
    when lower(coalesce(tipo_usuario, employee_type, role, '')) = 'admin' then 'admin'
    else 'profissional'
  end,
  funcoes = case
    when lower(coalesce(tipo_usuario, employee_type, role, '')) in ('caixa', 'cashier') then '{}'
    when funcoes is not null then funcoes
    when functions is not null and functions <> '' then string_to_array(functions, ',')
    when role is not null and role <> '' and lower(role) not in ('professional', 'profissional') then string_to_array(role, ',')
    else '{}'
  end;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_employee_type_check'
  ) then
    alter table public.employees
      add constraint employees_employee_type_check
      check (employee_type in ('admin', 'cashier', 'professional'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'employees_tipo_usuario_check'
  ) then
    alter table public.employees
      add constraint employees_tipo_usuario_check
      check (tipo_usuario in ('admin', 'caixa', 'profissional'));
  end if;
end $$;

alter table if exists public.cash_movements
  add column if not exists discount numeric(10,2) not null default 0,
  add column if not exists desconto numeric(10,2) not null default 0,
  add column if not exists notes text,
  add column if not exists observacao text;

alter table if exists public.cash_closures
  add column if not exists notes text,
  add column if not exists observacao text;

create index if not exists employees_salon_type_idx
  on public.employees (salon_id, employee_type);

create index if not exists cash_movements_salon_date_idx
  on public.cash_movements (salon_id, date desc);

create index if not exists cash_closures_salon_date_idx
  on public.cash_closures (salon_id, date desc);

alter table public.employees enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_closures enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'employees' and policyname = 'employees_por_salao'
  ) then
    create policy employees_por_salao on public.employees
      for all
      using (salon_id in (select salon_id from public.users where id = auth.uid()))
      with check (salon_id in (select salon_id from public.users where id = auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'cash_movements' and policyname = 'cash_movements_por_salao'
  ) then
    create policy cash_movements_por_salao on public.cash_movements
      for all
      using (salon_id in (select salon_id from public.users where id = auth.uid()))
      with check (salon_id in (select salon_id from public.users where id = auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'cash_closures' and policyname = 'cash_closures_por_salao'
  ) then
    create policy cash_closures_por_salao on public.cash_closures
      for all
      using (salon_id in (select salon_id from public.users where id = auth.uid()))
      with check (salon_id in (select salon_id from public.users where id = auth.uid()));
  end if;
end $$;
