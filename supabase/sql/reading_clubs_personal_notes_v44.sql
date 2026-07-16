-- Anotaciones personales por capítulo (biblioteca personal, SIN nada social:
-- ni comentarios, ni reacciones, ni hilos). Se guardan como mapa
-- { [chapterId]: [{ id, text, createdAt, editedAt? }] } en el propio libro.
alter table public.personal_books add column if not exists notes jsonb not null default '{}'::jsonb;
