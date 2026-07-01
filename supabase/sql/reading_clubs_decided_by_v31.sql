-- v31 — Cómo se resolvió una propuesta: 'vote' (quórum de votantes), 'deadline'
-- (venció el plazo) o 'admin' (lo decidió un admin). Se muestra al club para que
-- la decisión no se sienta arbitraria.
alter table public.books
  add column if not exists decided_by text;
