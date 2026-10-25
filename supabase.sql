-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Stores ONLY reading positions, shelf order, colours, groups and settings (a few KB per person).
-- Book text and PDFs never leave the device.
create table if not exists public.folio_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.folio_state enable row level security;

create policy "read own"   on public.folio_state for select using (auth.uid() = user_id);
create policy "insert own" on public.folio_state for insert with check (auth.uid() = user_id);
create policy "update own" on public.folio_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.folio_state for delete using (auth.uid() = user_id);

-- Guard against oversized rows (64 KB).
alter table public.folio_state add constraint folio_state_size check (pg_column_size(data) < 65536);
