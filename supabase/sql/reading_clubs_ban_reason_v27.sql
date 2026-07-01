-- v27 — Motivo de baneo. Permite decir al afectado (en español) por qué se le
-- vetó, en vez de un "You are banned from this club" seco y sin razón.
alter table public.community_bans
  add column if not exists reason text;
