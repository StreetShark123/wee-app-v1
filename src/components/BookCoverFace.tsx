import { GeneratedCover } from "./GeneratedCover";
import { UserDot } from "./UserBadge";

export interface CoverReader {
  userId: string;
  alias: string;
  avatarUrl?: string;
  colorIndex?: number;
  done: boolean;
}

interface BookCoverFaceProps {
  coverUrl?: string;
  title: string;
  author?: string;
  /** Progreso 0-100 a pintar sobre la portada; null = sin barra. */
  progressPct?: number | null;
  readers?: CoverReader[];
  /** Nº máximo de avatares antes del "+N". */
  maxReaders?: number;
}

// La "cara portada": portada a bleed completo con un overlay inferior (barra de
// progreso + avatares de lectores). Compartida por la tarjeta de biblioteca
// (estática) y la cara A del flip de la ficha — misma pinta en los dos sitios.
// Quien ya terminó se funde en un check (UserDot done) para que destaquen los
// que aún faltan por leer.
export const BookCoverFace = ({ coverUrl, title, author, progressPct = null, readers = [], maxReaders = 5 }: BookCoverFaceProps) => {
  const visible = readers.slice(0, maxReaders);
  const extra = readers.length - visible.length;
  const showOverlay = progressPct != null || visible.length > 0;
  return (
    <>
      {coverUrl ? (
        <img className="book-cover-img" src={coverUrl} alt="" loading="lazy" />
      ) : (
        <GeneratedCover className="book-cover-img" title={title} author={author} />
      )}
      {showOverlay ? (
        <span className="book-card-overlay">
          {progressPct != null ? (
            <span className="book-card-progress-bar" aria-hidden="true"><span className="book-card-progress-fill" style={{ width: `${progressPct}%` }} /></span>
          ) : null}
          {visible.length > 0 ? (
            <span className="book-card-readers-stack">
              {visible.map((r) => (
                <UserDot key={r.userId} alias={r.alias} avatarUrl={r.avatarUrl} colorIndex={r.colorIndex} done={r.done} />
              ))}
              {extra > 0 ? <span className="book-card-readers-more">+{extra}</span> : null}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
};
