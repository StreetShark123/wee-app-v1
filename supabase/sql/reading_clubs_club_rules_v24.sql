-- v24 — reglas del club (owner): quién puede añadir libros + baneos permanentes.
-- book_policy: admins_only | members_allowed (default: como hasta ahora, todos).
alter table public.communities add column if not exists book_policy text not null default 'members_allowed'
  check (book_policy in ('admins_only', 'members_allowed'));

-- Baneos permanentes (distinto de 'kicked': el baneado no puede volver a entrar).
create table if not exists public.community_bans (
  community_id uuid not null references public.communities(id) on delete cascade,
  global_user_id uuid not null references public.global_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (community_id, global_user_id)
);
alter table public.community_bans enable row level security;
drop policy if exists community_bans_no_access on public.community_bans;
create policy community_bans_no_access on public.community_bans for all using (false) with check (false);
