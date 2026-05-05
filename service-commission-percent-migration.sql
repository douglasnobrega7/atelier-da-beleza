alter table public.services
  add column if not exists commission_percent numeric not null default 0;
