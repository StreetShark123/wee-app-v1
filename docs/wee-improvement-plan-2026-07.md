# Plan de mejora integral — wee (club de lectura) · 2026-07

Consolida la simulación de 20 usuarios/3 meses + las 6 entrevistas de persona (Ana
organizadora, Beto social, Carmen info-sharer, Gus conflictivo, Kevin mayor poco-tech,
Hana lurker joven). **Ninguna persona dijo "me quedo" sin peros.** Diagnóstico de fondo:
la app está sólida **de cintura para abajo (el motor)** y coja **de cintura para arriba
(entrada, vida diaria, poder del miembro)**.

Ya DESPLEGADO en una ronda previa (no repetir): motor de decisión por quórum de votantes
+ aviso `book_proposed` + plazo 7d; rate-limit 20/min; ban oculta comentarios del baneado;
check de capítulo visible + ayuda inline; `--ink-1` a ~6:1; `.btn` 44px; validación de
protocolo en `image_url`; lápida "retirado por moderación".

Leyenda: **P0/P1/P2** prioridad · **S/M/L** esfuerzo · archivos indicativos.

---

## Fase E — Quick wins de fricción emocional (barato, alto impacto) · PRIMERO
Objetivo: quitar de un plumazo el dolor que reportaron varios perfiles con cambios pequeños.

- **E1 · Copy propio del rate-limit** — P0 · S. Hoy devuelve el mensaje de *login*
  ("Demasiados intentos. Espera unos minutos"); Beto y Gus (perfiles opuestos) lo leyeron
  como "me llaman spammer/bot". Mensaje específico y amable para escritura
  ("vas muy rápido, respira un momento y sigue"). `community-api/index.ts` (`tooManyAttempts`
  → variante para contenido), cliente que lo muestre bien.
- **E2 · Reabrir onboarding + glosario** — P0 · S/M. El onboarding se ve una vez y
  desaparece (Kevin: "me quitasteis el manual"; Hana). Botón persistente "¿Cómo funciona?"
  que reabra las pistas; tooltips/definición en jerga ("quórum", "cadencia", "facilita").
  `HomePage.tsx` (reabrir), microcopy en `BookDetailPage.tsx`/`CommunityPage.tsx`.
- **E3 · Undo-hint del check + reversibilidad visible** — P1 · S. Kevin vive con miedo a
  romper algo: marcar capítulo no dice que se puede desmarcar. Microcopy "puedes volver a
  pulsar para desmarcarlo" + revisar que las acciones reversibles lo comuniquen.
  `ChapterTimeline.tsx`.
- **E4 · Cuenta atrás visible del plazo** — P1 · S. El `vote_deadline` de 7 días es mudo
  (Ana, Gus). Mostrar "cierra en 3 días" en la propuesta (ficha + card). `BookDetailPage.tsx`,
  `BookCard.tsx` (el dato `voteDeadline` ya llega del backend).
- **E5 · Baneo en español + motivo** — P1 · S. `isBanned` responde "You are banned from
  this club" en inglés dentro de app española; el ban no guarda razón (Gus). i18n del
  mensaje + campo opcional de motivo mostrado al afectado. `community-api/index.ts`.
- **E6 · Clarificar "Facilita"** — P2 · S. El chip "Facilita: X" no da poder real (es
  `book.addedBy`) y confunde (Ana, Kevin). Renombrar a "Propuesto por" o explicar el rol.
  `BookDetailPage.tsx`.

## Fase F — Oxígeno social (motor de conversación) · churn de Beto
Objetivo: que la conversación "te devuelva" algo y no se apague en el peor momento.

- **F1 · Notificar reacciones y comentarios-a-tu-nota** — P0 · M. Hoy `/comments/react`
  no llama a `notify()` y un comentario a una nota-raíz no avisa al autor de la nota (Beto:
  "la mitad de la gasolina social no llega"). Nuevos kinds `reaction` y `note_comment`;
  emitir en `comments/react` y `books/comment`. `community-api/index.ts`, `notifications.ts`,
  `NotificationsMenu.tsx`. Requiere ampliar `notifications_kind_check` (migración).
- **F2 · Seguir hablando tras "leído"** — P0 · M. En `status==="finished"` desaparece el
  composer justo cuando se quiere hablar del final (Beto). Mantener un hilo abierto de
  "impresiones finales" (o no ocultar el composer en finished). `BookDetailPage.tsx`.
- **F3 · Mostrar a quién respondes** — P1 · S/M. Hilos de 1 nivel: responder a una
  respuesta la recuelga de la raíz y se pierde el "a quién hablo" (Beto). Mostrar
  "→ @alias" en la respuesta. `CommentThread.tsx`, backend guarda `reply_to_alias`/usa
  parentId real para la etiqueta.
- **F4 · Editar comentario destacado** — P1 · S. `/comments/update` no comprueba `pinned`:
  se puede hacer bait, lograr destacado y reescribir (Beto). Al editar un pinned: limpiar
  `pinned_at` o avisar. `community-api/index.ts`.
- **F5 · Set de reacciones** — P2 · M. Solo up/down; Beto quiere 🔥😂💯. Ampliar emojis en
  `comments/react` + UI. (Opcional, valorar contra el minimalismo del tema.)

## Fase G — Vida diaria / retención (home viva) · churn de Hana
Objetivo: dar una razón para abrir la app a diario y un río que mirar sin comprometerse.

- **G1 · Home como feed/digest** — P0 · L. La home es una balda estática (Hana): sin
  "qué ha pasado desde tu última visita". Sección de actividad reciente (notas/comentarios/
  progreso/propuestas nuevas). `HomePage.tsx` + endpoint de actividad agregada en backend.
- **G2 · Empty states cálidos** — P1 · S. "Aún no hay nada" × muchos = sensación de pueblo
  fantasma (Hana). Reemplazar por invitaciones con gracia ("sé la primera en dejar una nota").
  `HomePage.tsx`, `BookDetailPage.tsx`, `NotificationsMenu.tsx`.
- **G3 · Escalón intermedio lurk→participar** — P1 · M. Solo hay votar (invisible) o
  escribir un mini-ensayo; el placeholder "¿Por qué sí o por qué no?" pide demasiado (Hana).
  Reacción rápida a notas/quick-react desde la home; placeholders más ligeros.
  `CommentThread.tsx`, `ChapterTimeline.tsx`.
- **G4 · Reencuadrar la culpa** — P1 · S. "faltan 3 votos", metas "vencida" en rojo reciben
  al lurker con culpa (Hana, Ana). Framing positivo/neutro ("2 personas ya votaron", quitar
  el rojo de "vencida" salvo para el organizador). `BookDetailPage.tsx`.

## Fase H — Herramientas de organizador · churn de Ana
Objetivo: que Ana no tenga que mantener el club vivo por WhatsApp.

- **H1 · Panel de salud del club** — P0 · L. No ve quién lee/vota y quién se apaga (el dato
  existe: `chapters_done`, `book_votes`). Vista con actividad por miembro (última conexión,
  votos, progreso, lecturas seguidas). `CommunityPage.tsx` + endpoint.
- **H2 · Recordar a los que faltan** — P1 · M. No puede dar un toque a no-votantes/no-lectores.
  Acción de organizador "recordar" que emita notificación a quienes falten. Backend + UI.
- **H3 · Hitos de lectura programables** — P1 · L. La meta (`setBookTarget`) es una fecha
  muda; Ana quiere "cap. 1-4 para el domingo" con avisos. Hitos + recordatorios.
- **H4 · Historial/salud entre lecturas** — P2 · M. ¿Leemos lo que proponemos? ¿cuántos
  terminan? Métricas ligeras del club. (Sin vanity metrics; foco en salud.)

## Fase I — Moderación justa (completa la B diferida) · churn de Gus
Objetivo: dar poder al miembro y un escalón antes del abismo.

- **I1 · Denuncia por miembro** — P0 · M. No existe report para `book_comments`/notas (solo
  para posts). Tabla `comment_reports` + endpoint `/comments/report` + botón en `CommentThread`
  + cola/aviso al admin. Migración + backend + UI.
- **I2 · Mute temporal** — P1 · M. Solo hay baneo permanente (nuclear). `muted_until` en
  `community_users` + gate en escritura + acción admin. Migración + backend + UI.
- **I3 · Aviso/strike antes del baneo + motivo** — P1 · M. El ban es un interruptor sin
  escalón ni razón (Gus). Estado "amonestado" o aviso previo; el ban exige/guarda motivo (liga E5).
- **I4 · Roles admin solo-owner** — P1 · S. Cualquier admin puede promover/degradar admins;
  restringir gestión de roles al owner. `community-api/index.ts` (promote/demote).
- **I5 · Revisar borrado-en-cascada vs apelación** — P2 · M. Al banear se destruyen los
  comentarios (Gus: "destruye la prueba de mi versión"). Valorar ocultar-reversible (staff-only
  restaurable) en vez de borrar, para permitir apelación.

## Fase J — Valor del contenido (completa la C diferida) · churn de Carmen
Objetivo: que el aporte de recursos se vea, se junte y perdure.

- **J1 · Sección "Recursos del libro"** — P0 · M. Los enlaces se pierden en el scroll junto a
  los "me apunto"; no hay dónde juntarlos. Derivar y mostrar todos los enlaces (comentarios +
  notas) en una sección fija con autor y capítulo de origen. `BookDetailPage.tsx`.
- **J2 · Unfurl/preview de enlaces** — P1 · L. En comentarios los enlaces son texto azul;
  solo YouTube/imagen tienen preview. Reusar el pipeline de unfurl de *posts*
  (`preview_title/description/image/site_name`) para enlaces de comentario/nota.
- **J3 · `kind:reference` útil + sin-spoiler** — P1 · M. Hoy es cosmético (solo etiqueta).
  Hacerlo filtrable/coleccionable y añadir flag "sin spoiler" para que el anti-spoiler no tape
  contexto que no es spoiler (Carmen). `ChapterTimeline.tsx` + backend.
- **J4 · Consolidar recursos al pasar a "leído"** — P2 · M. Al terminar, dejar una "biblioteca
  de recursos" del libro consultable. Liga J1.
- **J5 · Clarificar notas vs comentarios** — P1 · S. Tres sitios para escribir con reglas
  distintas confunden (Carmen, Beto, Hana). Microcopy/guía de "dónde va cada cosa".

## Fase K — Claridad del modelo de decisión
Objetivo: que la votación no se sienta arbitraria ni decorativa (Gus, Ana).

- **K1 · Mostrar qué resolvió la propuesta** — P1 · S. Tres caminos (voto/plazo/admin) sin
  señal de cuál ganó. Indicar el resultado ("aprobado por votación / por plazo / por el admin").
- **K2 · Reencuadrar el override admin** — P1 · S. Hoy "Aprobar/Descartar" ignora la votación
  ("teatro"). Presentarlo como *desempate* con el conteo visible, no como atajo silencioso.
- **K3 · Explicar el quórum en llano** — P2 · S. "cuentan votos de cualquier signo" no es
  obvio leyendo "faltan 2 votos". Copy más claro (liga E2 glosario).

## Fase L — Accesibilidad remanente
- **L1 · Etiquetas/affordance** — P1 · M. Iconos sin palabra (Kevin) y acciones ocultas en
  `<details>` sin pinta de pulsable. Añadir etiquetas y affordance a los `summary`.
- **L2 · Texto secundario pequeño** — P2 · S. Pese al `--ink-1` más oscuro, fechas/hints en
  letra chica siguen costando (Kevin, Carmen). Subir tamaño mínimo de secundarios.
- **L3 · Deshacer ligero** — P2 · M. Toasts "Deshacer 5s" en acciones (marcar, borrar nota).

## Fase M — Escala
- **M1 · Paginar `/books/list`** — P2 · M. Hoy trae votos+stats de todos los libros; crece
  linealmente. Paginar/lazy antes de ~100 libros.

---

## Secuenciación recomendada
1. **E** (quick wins) — máximo alivio por el mínimo esfuerzo; toca a todos los perfiles.
2. **F + G** — atacan el churn real (Beto "dudo", Hana "una vez al mes"): oxígeno social + razón diaria.
3. **I** — cierra la herida de Gus (el único "no vuelvo") y protege al grupo.
4. **K** — barato y quita la sensación de arbitrariedad de la votación.
5. **H + J** — apuestas de fondo (organizador, recursos): las que hacen que el club *perdure*.
6. **L + M** — pulido de accesibilidad y escala.

## Verificación (cada fase)
`npx tsc --noEmit` · `npm run design:lint` · `npm run test` · `npm run build` (nvm 20).
Backend: `supabase functions deploy community-api` + migración aplicada + smokes curl contra
prod (crear club efímero, ejercitar el flujo, limpiar). Frontend: `vercel --prod`. Nota:
CORS bloquea el preview localhost → verificación por smokes; **validar visualmente en iPhone**.
