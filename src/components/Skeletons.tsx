// Placeholders de carga (skeletons) para que navegar sea fluido sin saltos.

export const BookGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="book-grid" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div className="sk-book" key={i}>
        <div className="sk sk-cover" />
        <div className="sk sk-line sk-line-lg" />
        <div className="sk sk-line sk-line-sm" />
      </div>
    ))}
  </div>
);

export const BookDetailSkeleton = () => (
  <div className="book-detail" aria-hidden="true">
    <div className="sk sk-back" />
    <section className="page-section book-detail-head">
      <div className="sk sk-cover-lg" />
      <div className="book-detail-meta sk-meta">
        <div className="sk sk-line sk-line-xl" />
        <div className="sk sk-line sk-line-md" />
        <div className="sk sk-line sk-line-full" />
        <div className="sk sk-line sk-line-full" />
        <div className="sk sk-line sk-line-sm" />
      </div>
    </section>
    <section className="page-section">
      <div className="sk sk-line sk-line-md" />
      <div className="sk sk-rows">
        <div className="sk sk-line sk-line-full" />
        <div className="sk sk-line sk-line-full" />
        <div className="sk sk-line sk-line-lg" />
      </div>
    </section>
  </div>
);
