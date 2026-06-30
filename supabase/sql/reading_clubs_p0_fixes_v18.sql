-- v18 — P0 fixes (tanda 1)
-- 1) chapter_notes.kind: el código y la UI ofrecen 'prompt' (ChapterTimeline
--    "Pregunta de debate") pero el CHECK solo permitía note/reference, así que
--    esas notas fallaban con 400 al guardar. Ampliamos el constraint.
-- 2) note_reactions (v12) y join_requests (v17) activaron RLS sin policy.
--    El resto del esquema usa un deny-all explícito (service_role lo salta);
--    añadimos el mismo patrón para no dejar el modelo inconsistente.

alter table public.chapter_notes drop constraint if exists chapter_notes_kind_check;
alter table public.chapter_notes
  add constraint chapter_notes_kind_check check (kind in ('note', 'reference', 'prompt'));

drop policy if exists note_reactions_no_access on public.note_reactions;
create policy note_reactions_no_access on public.note_reactions for all using (false) with check (false);

drop policy if exists join_requests_no_access on public.join_requests;
create policy join_requests_no_access on public.join_requests for all using (false) with check (false);
