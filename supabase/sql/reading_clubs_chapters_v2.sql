-- Reading Clubs v2 — capítulos con nombre + completados por usuario + anotaciones.
-- Ejecutar después de install_reading_clubs_v1.sql. Scope community_id, RLS deny-all
-- (acceso solo por edge function con service_role).

create extension if not exists pgcrypto;

-- Lista de capítulos del libro (con título y orden).
create table if not exists public.book_chapters (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  idx          int  not null,
  title        text not null,
  created_at   timestamptz not null default now(),
  unique (book_id, idx)
);
create index if not exists book_chapters_book_idx on public.book_chapters(community_id, book_id, idx);

-- Checkmark de capítulo completado por un miembro (book_id desnormalizado para contar barato).
create table if not exists public.chapter_completions (
  community_id uuid not null references public.communities(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  chapter_id   uuid not null references public.book_chapters(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (chapter_id, user_id)
);
create index if not exists chapter_completions_book_user_idx on public.chapter_completions(community_id, book_id, user_id);

-- Anotaciones por capítulo (notas/referencias del club).
create table if not exists public.chapter_notes (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  chapter_id   uuid not null references public.book_chapters(id) on delete cascade,
  user_id      uuid references public.community_users(id) on delete set null,
  kind         text not null default 'note' check (kind in ('note','reference')),
  text         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists chapter_notes_chapter_idx on public.chapter_notes(community_id, chapter_id, created_at);

-- RLS deny-all (solo service_role / edge function).
do $$
declare t text;
begin
  foreach t in array array['book_chapters','chapter_completions','chapter_notes']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_no_access', t);
    execute format('create policy %I on public.%I for all using (false) with check (false);', t || '_no_access', t);
  end loop;
end $$;
