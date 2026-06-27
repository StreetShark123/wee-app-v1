-- Reading Clubs v6 — cache de resultados de book-search (Google Books / Open Library).
-- Evita repetir llamadas a las APIs externas para la misma búsqueda. Solo service_role
-- (la edge function book-search) lee/escribe.
create table if not exists public.book_search_cache (
  cache_key  text primary key,
  results    jsonb not null,
  engine     text not null,
  fetched_at timestamptz not null default now()
);
create index if not exists book_search_cache_fetched_idx on public.book_search_cache(fetched_at);

alter table public.book_search_cache enable row level security;
drop policy if exists book_search_cache_no_access on public.book_search_cache;
create policy book_search_cache_no_access on public.book_search_cache for all using (false) with check (false);
