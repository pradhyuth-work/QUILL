-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- folio_state: reading positions, shelf order, colours, groups and settings (a few KB per person).
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

-- folio_books: the text of books a signed-in reader has added, so an account's library
-- (not just its reading positions) follows that reader to another device. One row per
-- book per reader. Skip this table if you want sync limited to positions and shelf order,
-- with book text staying device-only as in the original design.
create table if not exists public.folio_books (
  user_id    uuid not null references auth.users(id) on delete cascade,
  book_id    text not null,
  meta       jsonb not null,
  chapters   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
alter table public.folio_books enable row level security;

create policy "read own books"   on public.folio_books for select using (auth.uid() = user_id);
create policy "insert own books" on public.folio_books for insert with check (auth.uid() = user_id);
create policy "update own books" on public.folio_books for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own books" on public.folio_books for delete using (auth.uid() = user_id);

-- Guard against runaway rows (15 MB per book).
alter table public.folio_books add constraint folio_books_size check (pg_column_size(chapters) < 15728640);
