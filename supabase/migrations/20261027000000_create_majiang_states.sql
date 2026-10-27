create table if not exists public.majiang_states (
  group_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.majiang_states enable row level security;
