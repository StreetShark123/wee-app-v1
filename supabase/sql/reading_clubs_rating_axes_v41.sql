-- Valoración orientada al debate: género del libro + ejes por usuario.
-- books.genre: null = solo nota global (retrocompat). member_books.axes: jsonb
-- {"eje": 1..5} por usuario; filas viejas quedan '{}'. Cero migración de datos.
alter table public.books add column if not exists genre text;
alter table public.member_books add column if not exists axes jsonb not null default '{}'::jsonb;
