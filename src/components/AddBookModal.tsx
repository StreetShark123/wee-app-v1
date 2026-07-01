import { AnimatePresence, m } from "framer-motion";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { pick, useI18n } from "../lib/i18n";
import { EASE_STANDARD, MOTION_DURATION } from "../lib/motion";
import {
  type BookDraft,
  type BookSearchResult,
  emptyDraft,
  resultToDraft,
  searchBooks
} from "../lib/bookSearch";
import { Icon } from "./Icon";

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  onAddBook: (book: BookDraft) => Promise<void>;
  onToast: (message: string) => void;
}

type Phase = "search" | "review";

export const AddBookModal = ({ open, onClose, onAddBook, onToast }: AddBookModalProps) => {
  const { language } = useI18n();
  const [phase, setPhase] = useState<Phase>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<BookDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setPhase("search");
      setQuery("");
      setResults([]);
      setSearching(false);
      setDraft(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  // Búsqueda con debounce: un ISBN (solo dígitos/X, ≥10) busca exacto; si no, texto libre.
  useEffect(() => {
    const term = query.trim();
    if (!open || phase !== "search" || term.length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const compact = term.replace(/[^0-9Xx]/g, "");
        const isIsbn = compact.length >= 10 && compact.length === term.replace(/[\s-]/g, "").length;
        const found = await searchBooks(isIsbn ? { isbn: compact } : { q: term, maxResults: 12 });
        if (!cancelled) setResults(found);
      } catch {
        if (!cancelled) {
          setResults([]);
          onToast(
            pick(
              language,
              "No se pudo buscar ahora. Prueba otra vez.",
              "Couldn't search right now. Try again.",
              "Non se puido buscar agora. Proba outra vez."
            )
          );
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open, phase, language, onToast]);

  const selectResult = (result: BookSearchResult) => {
    setDraft(resultToDraft(result));
    setPhase("review");
  };

  const startManual = () => {
    setDraft(emptyDraft());
    setPhase("review");
  };

  const editField = <K extends keyof BookDraft>(key: K, value: BookDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value, manuallyEdited: true } : prev));
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || submitting) return;
    if (!draft.title.trim()) {
      onToast(pick(language, "El título es obligatorio.", "Title is required.", "O título é obrigatorio."));
      return;
    }
    setSubmitting(true);
    try {
      await onAddBook({ ...draft, title: draft.title.trim() });
      onClose();
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : pick(language, "No se pudo añadir el libro.", "Couldn't add the book.", "Non se puido engadir o libro.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="modal-overlay modal-overlay-share"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION_DURATION.fast, ease: EASE_STANDARD }}
          onClick={onClose}
        >
          <m.section
            ref={dialogRef}
            className="modal-card modal-card-share"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-book-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <h2 id="add-book-title">
                  {phase === "search"
                    ? pick(language, "Añade un libro", "Add a book", "Engade un libro")
                    : pick(language, "Revisa los datos", "Review the details", "Revisa os datos")}
                </h2>
                <p>
                  {phase === "search"
                    ? pick(
                        language,
                        "Busca por título, autor o ISBN. Elige el correcto y ajústalo si hace falta.",
                        "Search by title, author or ISBN. Pick the right one and tweak it if needed.",
                        "Busca por título, autor ou ISBN. Escolle o correcto e axústao se fai falta."
                      )
                    : pick(
                        language,
                        "Puedes editar cualquier campo antes de guardarlo en el club.",
                        "You can edit any field before saving it to the club.",
                        "Podes editar calquera campo antes de gardalo no club."
                      )}
                </p>
              </div>
              <button type="button" className="btn" onClick={onClose}>
                {pick(language, "Cerrar", "Close", "Pechar")}
              </button>
            </header>

            {phase === "search" ? (
              <div className="stack">
                <label>
                  {pick(language, "Buscar", "Search", "Buscar")}
                  <span className="input-icon">
                    <Icon name="search" />
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={pick(
                        language,
                        "p.ej. El nombre del viento",
                        "e.g. The Name of the Wind",
                        "p.ex. O nome do vento"
                      )}
                      autoFocus
                    />
                  </span>
                </label>

                {searching ? (
                  <p className="hint">
                    {pick(language, "Buscando", "Searching", "Buscando")}
                    <span className="loading-dots" aria-hidden="true" />
                  </p>
                ) : null}

                {!searching && query.trim().length >= 3 && results.length === 0 ? (
                  <p className="hint">
                    {pick(language, "Sin resultados.", "No results.", "Sen resultados.")}
                  </p>
                ) : null}

                <ul className="book-results">
                  {results.map((result) => (
                    <li key={result.sourceId}>
                      <button type="button" className="book-result" onClick={() => selectResult(result)}>
                        {result.coverUrl ? (
                          <img className="book-cover" src={result.coverUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="book-cover book-cover-empty" aria-hidden="true">
                            <Icon name="book" />
                          </span>
                        )}
                        <span className="book-meta">
                          <strong>{result.title}</strong>
                          <span>{result.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}</span>
                          {result.publishedYear ? <small>{result.publishedYear}</small> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <button type="button" className="btn" onClick={startManual}>
                  <Icon name="pencil" /> {pick(language, "Añadirlo a mano", "Add it manually", "Engadilo a man")}
                </button>
              </div>
            ) : draft ? (
              <form className="stack" onSubmit={confirm}>
                <div className="book-review">
                  {draft.coverUrl ? (
                    <img className="book-cover book-cover-lg" src={draft.coverUrl} alt="" />
                  ) : (
                    <span className="book-cover book-cover-lg book-cover-empty" aria-hidden="true">
                      <Icon name="book" />
                    </span>
                  )}
                  <div className="stack book-review-fields">
                    <label>
                      {pick(language, "Título", "Title", "Título")}
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(event) => editField("title", event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      {pick(language, "Autor", "Author", "Autor")}
                      <input
                        type="text"
                        value={draft.author ?? ""}
                        onChange={(event) => editField("author", event.target.value || null)}
                      />
                    </label>
                    <label>
                      {pick(language, "Enlace del autor (opcional)", "Author link (optional)", "Ligazón do autor (opcional)")}
                      <input
                        type="url"
                        value={draft.authorUrl ?? ""}
                        onChange={(event) => editField("authorUrl", event.target.value || null)}
                        placeholder={pick(language, "Wikipedia, web...", "Wikipedia, website...", "Wikipedia, web...")}
                      />
                    </label>
                    <div className="book-review-row">
                      <label>
                        {pick(language, "Año", "Year", "Ano")}
                        <input
                          type="number"
                          value={draft.publishedYear ?? ""}
                          onChange={(event) =>
                            editField("publishedYear", event.target.value ? Number(event.target.value) : null)
                          }
                        />
                      </label>
                      <label>
                        {pick(language, "Páginas", "Pages", "Páxinas")}
                        <input
                          type="number"
                          value={draft.pageCount ?? ""}
                          onChange={(event) =>
                            editField("pageCount", event.target.value ? Number(event.target.value) : null)
                          }
                        />
                      </label>
                    </div>
                    <label>
                      ISBN
                      <input
                        type="text"
                        value={draft.isbn ?? ""}
                        onChange={(event) => editField("isbn", event.target.value || null)}
                      />
                    </label>
                  </div>
                </div>

                <label>
                  {pick(language, "Sinopsis", "Description", "Sinopse")}
                  <textarea
                    rows={4}
                    value={draft.description ?? ""}
                    onChange={(event) => editField("description", event.target.value || null)}
                    placeholder={pick(
                      language,
                      "Opcional — añade una sinopsis si quieres.",
                      "Optional — add a synopsis if you like.",
                      "Opcional — engade unha sinopse se queres."
                    )}
                  />
                </label>

                <label>
                  {pick(language, "¿Por qué lo recomiendas?", "Why do you recommend it?", "Por que o recomendas?")}
                  <span className="field-hint">{pick(language, "Un buen motivo convence al club y ayuda a que salga adelante.", "A good reason convinces the club and helps it get picked.", "Un bo motivo convence ao club e axuda a que saia adiante.")}</span>
                  <textarea
                    rows={2}
                    value={draft.proposalNote}
                    onChange={(event) => editField("proposalNote", event.target.value)}
                    placeholder={pick(
                      language,
                      "Ej.: «Me marcó por cómo trata la memoria y el duelo, y se lee del tirón.»",
                      "E.g.: “It stuck with me for how it handles memory and grief, and it's a page-turner.”",
                      "Ex.: «Marcoume por como trata a memoria e o dó, e lese do tirón.»"
                    )}
                  />
                </label>

                <div className="book-review-actions">
                  <button type="button" className="btn" onClick={() => setPhase("search")} disabled={submitting}>
                    <Icon name="arrowLeft" /> {pick(language, "Volver", "Back", "Volver")}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    <Icon name="plus" />{" "}
                    {submitting ? (
                      <>
                        {pick(language, "Añadiendo", "Adding", "Engadindo")}
                        <span className="loading-dots" aria-hidden="true" />
                      </>
                    ) : (
                      pick(language, "Añadir al club", "Add to club", "Engadir ao club")
                    )}
                  </button>
                </div>
              </form>
            ) : null}
          </m.section>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
};
