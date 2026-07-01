-- v29 — Silencio temporal (mute) como escalón previo al baneo permanente. Un
-- miembro silenciado no puede escribir comentarios/notas hasta que venza el plazo.
alter table public.community_users
  add column if not exists muted_until timestamptz;
