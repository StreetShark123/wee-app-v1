-- v14: el sistema de reacciones pasa a voto up/down. Limpiamos emojis antiguos.
delete from public.comment_reactions where emoji not in ('up','down');
delete from public.note_reactions where emoji not in ('up','down');
