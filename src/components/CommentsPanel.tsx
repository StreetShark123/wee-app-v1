import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { pick, useI18n } from "../lib/i18n";
import { Avatar } from "./Avatar";
import { EmojiMenu } from "./EmojiMenu";
import { Icon } from "./Icon";
import type { Post, User } from "../lib/types";

interface CommentActionResult {
  ok: boolean;
  message: string;
  post?: Post;
}

interface CommentsPanelProps {
  post: Post;
  usersById: Map<string, User>;
  activeUserId: string | null;
  onAddComment: (postId: string, text: string) => Promise<CommentActionResult>;
  onVoteCommentAura: (postId: string, commentId: string) => Promise<CommentActionResult>;
  onDeleteComment?: (postId: string, commentId: string) => Promise<CommentActionResult>;
  onPostUpdate?: (post: Post) => void;
  onToast: (message: string) => void;
  compact?: boolean;
  canModerateComments?: boolean;
}

const relativeTime = (timestamp: number, language: "es" | "en" | "gl"): string => {
  const diffMs = Date.now() - timestamp;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) {
    if (language === "en") return `${mins}m ago`;
    if (language === "gl") return `hai ${mins}m`;
    return `hace ${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    if (language === "en") return `${hours}h ago`;
    if (language === "gl") return `hai ${hours}h`;
    return `hace ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (language === "en") return `${days}d ago`;
  if (language === "gl") return `hai ${days}d`;
  return `hace ${days}d`;
};

export const CommentsPanel = ({
  post,
  usersById,
  activeUserId,
  onAddComment,
  onVoteCommentAura,
  onDeleteComment,
  onPostUpdate,
  onToast,
  compact = false,
  canModerateComments = false
}: CommentsPanelProps) => {
  const { language } = useI18n();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const comments = post.comments ?? [];

  const sortedComments = useMemo(
    () =>
      [...comments].sort((a, b) => b.createdAt - a.createdAt),
    [comments]
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const result = await onAddComment(post.id, text);
    onToast(result.message);
    if (result.ok) {
      setDraft("");
      if (result.post && onPostUpdate) onPostUpdate(result.post);
    }
    setBusy(false);
  };

  return (
    <section className={compact ? "comments-panel comments-panel-compact" : "comments-panel"}>
      <div className="comments-head">
        <h4>{pick(language, "Comentarios", "Comments", "Comentarios")}</h4>
        <div className="comments-head-actions">
          <span className="badge">{comments.length}</span>
          {canModerateComments && onDeleteComment ? (
            <button
              type="button"
              className="btn"
              onClick={() => setSettingsOpen((prev) => !prev)}
            >
              <Icon name="settings" size={14} /> {pick(language, "Ajustes", "Settings", "Axustes")}
            </button>
          ) : null}
        </div>
      </div>
      {canModerateComments && onDeleteComment && settingsOpen ? (
        <div className="comments-tools">
          <button
            type="button"
            className={deleteMode ? "btn btn-primary comments-tools-toggle" : "btn comments-tools-toggle"}
            onClick={() => setDeleteMode((prev) => !prev)}
          >
            <Icon name="trash" size={13} />{" "}
            {deleteMode
              ? pick(language, "Modo borrar: activo", "Delete mode: on", "Modo borrar: activo")
              : pick(language, "Borrar comentarios", "Delete comments", "Borrar comentarios")}
          </button>
        </div>
      ) : null}

      <form className="comments-form" onSubmit={submit}>
        <div className="comment-input-wrap">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={pick(language, "Comparte tu opinión, comenta un pasaje o pasa una fuente...", "Add context, fix a detail or share a source...", "Engade contexto, corrixe un dato ou pasa unha fonte...")}
            maxLength={320}
            disabled={!activeUserId || busy}
          />
          <EmojiMenu
            disabled={!activeUserId || busy}
            onSelect={(emoji) => setDraft((prev) => `${prev}${prev ? " " : ""}${emoji}`)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-icon-compact"
          disabled={!activeUserId || busy}
          aria-label={pick(language, "Enviar comentario", "Send comment", "Enviar comentario")}
          title={pick(language, "Enviar comentario", "Send comment", "Enviar comentario")}
        >
          <Icon name="send" size={14} />
        </button>
      </form>

      <div className="comments-list">
        {sortedComments.length === 0 ? (
          <article className="empty-state">
            <h3>{pick(language, "Aún no hay comentarios", "No comments yet", "Aínda non hai comentarios")}</h3>
            <p>{pick(language, "Sé la primera persona en abrir el debate aquí.", "Be the first one to add context here.", "Sé a primeira persoa en deixar contexto aquí.")}</p>
          </article>
        ) : (
          sortedComments.slice(0, compact ? 3 : 12).map((comment) => {
            const author = usersById.get(comment.userId);
            const auraCount = comment.auraUserIds?.length ?? 0;
            const auraActive = !!activeUserId && (comment.auraUserIds ?? []).includes(activeUserId);
            return (
              <article key={comment.id} className="comment-item">
                {canModerateComments && onDeleteComment && deleteMode ? (
                  <button
                    type="button"
                    className="comment-delete-corner"
                    onClick={async () => {
                      const result = await onDeleteComment(post.id, comment.id);
                      onToast(result.message);
                      if (result.ok && onPostUpdate) {
                        onPostUpdate({
                          ...post,
                          comments: comments.filter((entry) => entry.id !== comment.id)
                        });
                      }
                    }}
                    title={pick(language, "Eliminar comentario", "Delete comment", "Eliminar comentario")}
                    aria-label={pick(language, "Eliminar comentario", "Delete comment", "Eliminar comentario")}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                ) : null}
                <header>
                  {author ? <Avatar user={author} size={22} /> : null}
                  {author ? <Link to={`/profile/${author.id}/posts`} className="comment-author-link">{author.alias}</Link> : <strong>{pick(language, "usuario", "user", "usuario")}</strong>}
                  <span className="hint">{relativeTime(comment.createdAt, language)}</span>
                </header>
                <p>{comment.text}</p>
                <button
                  type="button"
                  className={auraActive ? "btn btn-primary aura-btn" : "btn aura-btn"}
                  disabled={!activeUserId}
                  onClick={async () => {
                    if (!activeUserId) return;
                    const previousAura = comment.auraUserIds ?? [];
                    const nextAuraSet = new Set(previousAura);
                    if (nextAuraSet.has(activeUserId)) {
                      nextAuraSet.delete(activeUserId);
                    } else {
                      nextAuraSet.add(activeUserId);
                    }
                    const optimisticPost: Post = {
                      ...post,
                      comments: comments.map((entry) =>
                        entry.id === comment.id ? { ...entry, auraUserIds: Array.from(nextAuraSet) } : entry
                      )
                    };
                    if (onPostUpdate) onPostUpdate(optimisticPost);

                    const result = await onVoteCommentAura(post.id, comment.id);
                    onToast(result.message);
                    if (result.ok && result.post && onPostUpdate) {
                      onPostUpdate(result.post);
                    } else if (!result.ok && onPostUpdate) {
                      onPostUpdate({
                        ...post,
                        comments: comments.map((entry) =>
                          entry.id === comment.id ? { ...entry, auraUserIds: previousAura } : entry
                        )
                      });
                    }
                  }}
                >
                  Aura {auraCount}
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
