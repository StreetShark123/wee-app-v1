-- Restablecimiento de contraseña por enlace (admin lo genera, se lo pasa al
-- miembro por el canal que sea; sin depender del email). Token de un solo uso,
-- caduca a las 24h. Guardamos solo el HASH del token (como las sesiones).
create table if not exists public.password_reset_tokens (
  token_hash     text primary key,
  global_user_id uuid not null references public.global_users(id) on delete cascade,
  created_by     uuid,               -- community_user id del admin que lo generó (auditoría)
  community_id   uuid,               -- club desde el que se generó (auditoría)
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_idx on public.password_reset_tokens(global_user_id);

-- RLS deny-all (solo service_role / edge function).
alter table public.password_reset_tokens enable row level security;
drop policy if exists password_reset_tokens_no_access on public.password_reset_tokens;
create policy password_reset_tokens_no_access on public.password_reset_tokens for all using (false) with check (false);
