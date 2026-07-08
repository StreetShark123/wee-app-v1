-- Web Push: suscripciones de dispositivo + preferencias por tipo.
-- Keyed por community_users.id (= el user_id de las notificaciones) → casa
-- directo con notify(). RLS deny-all: solo la edge function (service_role) toca
-- estas tablas; el cliente pasa siempre por los endpoints /push/*.

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(community_id, user_id);

-- Preferencias por usuario/club: master on/off + categorías. Las "ruidosas"
-- (comments, chapters) por defecto OFF; las personales/hitos ON.
create table if not exists public.push_prefs (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  enabled      boolean not null default true,
  categories   jsonb not null default '{"replies":true,"milestones":true,"comments":false,"chapters":false}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (community_id, user_id)
);

-- RLS deny-all (solo service_role / edge function).
do $$
declare t text;
begin
  foreach t in array array['push_subscriptions','push_prefs']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_no_access', t);
    execute format('create policy %I on public.%I for all using (false) with check (false);', t || '_no_access', t);
  end loop;
end $$;
