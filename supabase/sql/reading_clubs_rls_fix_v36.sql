-- FIX de seguridad: `book_meeting_rsvp` (v35) y `comment_reports` (v30) se
-- crearon SIN activar RLS. Como el anon key viaja en el bundle del front,
-- cualquiera con la URL del proyecto podía leer/editar/borrar esas tablas
-- directamente por PostgREST, saltándose la edge function (aviso de Supabase
-- `rls_disabled_in_public`). Se aplica el mismo deny-all que el resto: RLS on +
-- policy que niega todo a anon/authenticated; service_role (la edge function)
-- la salta y sigue funcionando igual.

do $$
declare t text;
begin
  foreach t in array array['book_meeting_rsvp','comment_reports']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_no_access', t);
    execute format('create policy %I on public.%I for all using (false) with check (false);', t || '_no_access', t);
  end loop;
end $$;
