-- v33 — Índices para el feed de actividad (filtro por comunidad + orden por fecha).
create index if not exists book_comments_activity_idx on public.book_comments (community_id, created_at desc);
create index if not exists chapter_notes_activity_idx on public.chapter_notes (community_id, created_at desc);
create index if not exists chapter_completions_activity_idx on public.chapter_completions (community_id, completed_at desc);
