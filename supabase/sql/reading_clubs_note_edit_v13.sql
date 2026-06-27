-- v13: anotaciones editables (marca de editado), igual que comentarios.
alter table public.chapter_notes add column if not exists edited_at timestamptz;
