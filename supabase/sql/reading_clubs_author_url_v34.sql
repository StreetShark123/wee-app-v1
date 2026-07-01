-- v34 — Enlace opcional del autor (Wikipedia, web...) que el proponente añade al
-- crear el libro. Sustituye al enlace de Wikipedia adivinado (poco fiable).
alter table public.books add column if not exists author_url text;
