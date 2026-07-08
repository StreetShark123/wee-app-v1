-- FIX: muchos clubs antiguos tienen communities.created_by_user_id = NULL (el
-- backfill del "owner" nunca corrió). Con owner null, ownerOf() devolvía null y
-- NADIE podía nombrar/gestionar admins ("Solo el fundador puede…"), ni el propio
-- fundador. Se fija el owner = admin ACTIVO más antiguo del club (el fundador de
-- facto), solo donde está a null. Idempotente.

update public.communities c
set created_by_user_id = sub.owner_id
from (
  select u.community_id,
         u.id as owner_id,
         row_number() over (partition by u.community_id order by u.created_at asc) as rn
  from public.community_users u
  join public.community_user_roles r
    on r.community_id = u.community_id and r.user_id = u.id and r.role = 'admin'
  where u.status = 'active'
) sub
where c.id = sub.community_id
  and sub.rn = 1
  and c.created_by_user_id is null;
