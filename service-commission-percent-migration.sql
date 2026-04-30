alter table public.services
  add column if not exists commission_percent numeric not null default 0;

alter table public.services
  drop column if exists commission_by_role;
