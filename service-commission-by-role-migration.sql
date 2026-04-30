alter table public.services
  add column if not exists commission_by_role jsonb not null default '{}'::jsonb;
