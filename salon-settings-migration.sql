alter table public.salons
  add column if not exists whatsapp text,
  add column if not exists working_days jsonb not null default '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb,
  add column if not exists opening_hours jsonb not null default '{
    "monday": {"open": "09:00", "close": "18:00"},
    "tuesday": {"open": "09:00", "close": "18:00"},
    "wednesday": {"open": "09:00", "close": "18:00"},
    "thursday": {"open": "09:00", "close": "18:00"},
    "friday": {"open": "09:00", "close": "18:00"},
    "saturday": {"open": "09:00", "close": "18:00"},
    "sunday": {"open": "09:00", "close": "18:00"}
  }'::jsonb;
