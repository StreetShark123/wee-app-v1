# Valoración de libros orientada al DEBATE (plan)

**Objetivo**: que valorar un libro alimente el **debate final** del club y ayude a
quien guía a entender **cómo vivió el libro cada persona**. NO es puntuar un
producto (nada de nota/ranking mercantilista). El radar es "el mapa del club sobre
este libro", no una ficha de producto.

## Modelo de datos (el approach simple, decidido)
2 columnas, 0 tablas nuevas:
- `books.genre text` (nullable; null = solo nota global).
- `member_books.axes jsonb default '{}'` → `{"pace":4,"prose":5}`. La fila
  `member_books` (que ya tiene `rating` + `review`) ES la "Valoración".
- `src/lib/ratingAxes.ts` = fuente de verdad de géneros→ejes (config en código,
  no tabla; añadir género = añadir entrada). Front renderiza y back valida contra
  ella. Retrocompat automática (filas viejas → axes `{}`, solo nota global).
- Agregación (media/dispersión/extremos por eje) en JS sobre `axes` de los
  miembros activos, en `/books/get`. Sin SQL nuevo. (Normalizar a `ValoracionEje`
  solo si algún día no-devs editan ejes o hace falta analítica SQL cruzada.)

## Géneros y ejes (set definitivo, compacto — 4 ejes máx, en clave "cómo lo viviste")
Nota global 1–5 SIEMPRE (única comparable entre libros), con leyenda semántica.

- **Ficción** (5 ejes):
  - Ritmo: lento ↔ trepidante
  - Personajes: planos ↔ inolvidables
  - Trama y mundo: previsible ↔ me atrapó
  - Emoción: me dejó frío ↔ me removió
  - Prosa: funcional ↔ me enamoró la escritura
- **No ficción** (5 ejes):
  - Solidez: flojo ↔ convincente
  - Claridad: denso ↔ cristalino
  - Novedad: ya lo sabía ↔ me abrió la cabeza
  - Me removió: me dejó igual ↔ me cambió la opinión
  - Amenidad: árido ↔ me enganchó
- **Otro** (poesía, biografía, cómic…): solo nota global de momento.

Input = **slider** arrastrable 1–5 (no botones); "sin valorar" hasta tocarlo.
Radar se adapta al nº de ejes (pentágono con 5).

## Experiencia (paso a paso, cómoda)
Se desbloquea al terminar el libro (`allDone`). Mini-asistente:
1. **Ejes primero** (según género): una tarjeta por eje con sus polos, 1–5,
   navegable ‹ ›, opcionales (se pueden saltar).
2. **Estrellas al final** con **leyenda visible** de cada punto (resalta el nivel
   activo). [Fase 1 HECHA: leyenda ya implementada en el input de estrellas.]
3. **Reseña** opcional → Guardar (con feedback/destello, ya existe).

## Gating (a propósito, anti-sesgo)
- **Sin valorar el libro NO se ve la comparativa del club.** Valoras primero, sin
  ver a los demás → tu opinión no se contamina. Primero aportas, luego comparas.
- Las gráficas se revelan solo cuando TU proceso está completo (encaja con
  `spoilersOk` / cita de debate).

## Radar (herramienta de conversación)
- Tu capa + media del club + **banda de desacuerdo** (min–max/desv.): ancho =
  tema de debate.
- **Extremos con avatar**: en cada eje, avatar del usuario en la punta baja y
  alta ("quién lo vio más lento / más trepidante") — da caras al debate. Usa los
  avatares de Storage.
- Radar por-persona conmutable (para que quien guía entienda al grupo; capas de
  color, sin números-trofeo).
- Bloque "Para el debate": mayor acuerdo / mayor choque / a quién le llegó
  distinto. Nunca "lo más valorado" mercantilista.
- SVG puro (sin librerías; CSP/bundle).

## Fases de rollout
1. **HECHA** — leyenda semántica en la nota global (solo UI, 0 esquema). commit e75fc09.
2. Ficción: `books.genre` + `ratingAxes.ts` + `member_books.axes` + asistente +
   radar-debate. Medir % de valoraciones que usan ejes.
3. No ficción: solo añadir su set al config.
4. Badges/reconocimientos no competitivos (primera reseña con ejes, 10 libros
   valorados, quien más aporta ejes completos). Tono comunidad. Push milestones.

Ref: proyecto Supabase hjemuoqabnzyjdyphico. Ver memoria del agente para gotchas
(tsc local colgado por iCloud → typecheck vía build de Vercel).
