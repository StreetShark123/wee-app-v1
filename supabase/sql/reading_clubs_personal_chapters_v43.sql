-- Biblioteca personal: seguimiento de capítulos a título individual (sin nada
-- social — ni comentarios, ni valoración, ni cita). `chapters` = lista ordenada
-- [{id,title}]; `chapters_done` = ids de capítulos marcados como leídos.
alter table public.personal_books add column if not exists chapters      jsonb not null default '[]'::jsonb;
alter table public.personal_books add column if not exists chapters_done  jsonb not null default '[]'::jsonb;
