-- v15: numeración de capítulos por libro (activa por defecto).
alter table public.books add column if not exists number_chapters boolean not null default true;
