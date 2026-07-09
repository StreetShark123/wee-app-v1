-- Biblioteca personal: independiente de cualquier club, va por global_user_id
-- (no community_id). "Quiero leer" / "Leyendo" / "Leído" a título individual.
create table if not exists public.personal_books (
  id             uuid primary key default gen_random_uuid(),
  global_user_id uuid not null references public.global_users(id) on delete cascade,
  isbn           text,
  title          text not null,
  author         text,
  cover_url      text,
  description    text,
  genre          text,
  published_year int,
  page_count     int,
  source         text not null default 'manual',
  shelf          text not null default 'want' check (shelf in ('want', 'reading', 'read')),
  added_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists personal_books_user_idx on public.personal_books(global_user_id, shelf);

-- Al proponer al club un libro que ya tenías como "Leído" en tu biblioteca
-- personal, se marca (para mostrar "Leído por X" antes de que nadie vote).
alter table public.books add column if not exists proposed_as_read boolean not null default false;

-- RLS deny-all (solo service_role / edge function).
alter table public.personal_books enable row level security;
drop policy if exists personal_books_no_access on public.personal_books;
create policy personal_books_no_access on public.personal_books for all using (false) with check (false);
