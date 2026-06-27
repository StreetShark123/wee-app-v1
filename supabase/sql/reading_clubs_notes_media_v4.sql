-- Reading Clubs v4 — media en anotaciones de capítulo (imagen opcional).
-- Los enlaces se detectan en el texto (frontend); aquí solo añadimos imagen.
alter table public.chapter_notes add column if not exists image_url text;
