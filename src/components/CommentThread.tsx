import { m } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { BookComment, ClubMemberLite } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { useConfirm } from "../lib/confirm";
import { timeAgo } from "../lib/timeAgo";
import { EASE_STANDARD, MOTION_DURATION } from "../lib/motion";
import { Icon } from "./Icon";
import { Linkify } from "./Linkify";
import { MentionTextarea } from "./MentionTextarea";
import { UserBadge, styleFor } from "./UserBadge";
import { VoteControl } from "./VoteControl";

const CommentItem = ({
  comment,
  members,
  activeUserId,
  chapterLabel,
  isAdmin = false,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin,
  isReply
}: {
  comment: BookComment;
  members: ClubMemberLite[];
  activeUserId: string;
  chapterLabel?: string;
  isAdmin?: boolean;
  onReply: (parentId: string, text: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => void;
  onEdit: (commentId: string, text: string) => Promise<void>;
  onDelete: (commentId: string) => void;
  onPin?: (commentId: string, pinned: boolean) => void;
  isReply: boolean;
}) => {
  const { language } = useI18n();
  const confirm = useConfirm();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const isMine = comment.userId === activeUserId;
  const canDelete = isMine || isAdmin; // el admin modera comentarios ajenos
  const replyTarget = comment.parentId ?? comment.id; // hilos de 1 nivel

  const submitReply = async () => {
    const clean = replyText.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      await onReply(replyTarget, clean);
      setReplyText("");
      setReplyOpen(false);
    } finally {
      setSending(false);
    }
  };

  const submitEdit = async () => {
    const clean = editText.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      await onEdit(comment.id, clean);
      setEditOpen(false);
    } finally {
      setSending(false);
    }
  };

  if (comment.deleted) {
    return (
      <li id={`c-${comment.id}`} className={`comment-item comment-tombstone${isReply ? " comment-item-reply" : ""}`}>
        <p className="comment-deleted"><Icon name="trash" size={12} /> {pick(language, "Comentario eliminado por el autor", "Comment deleted by its author", "Comentario eliminado polo autor")}</p>
      </li>
    );
  }

  return (
    <m.li
      id={`c-${comment.id}`}
      className={`comment-item${isReply ? " comment-item-reply" : ""}${comment.pinned ? " comment-pinned" : ""}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
    >
      <div className="comment-head">
        <Link to={`/profile/${comment.userId}`} className="comment-author-link">
          <UserBadge alias={comment.alias} {...styleFor(members, comment.userId)} withAvatar={!isReply} />
        </Link>
        <span className="comment-time">{timeAgo(comment.createdAt, language)}</span>
        {comment.pinned ? <span className="comment-pinned-tag"><Icon name="star" size={11} /> {pick(language, "Destacado", "Featured", "Destacado")}</span> : null}
        {chapterLabel ? <span className="comment-chapter-tag">{pick(language, `Cap. ${chapterLabel}`, `Ch. ${chapterLabel}`, `Cap. ${chapterLabel}`)}</span> : null}
        {comment.editedAt ? <span className="comment-edited-tag">{pick(language, "(editado)", "(edited)", "(editado)")}</span> : null}
      </div>

      {editOpen ? (
        <div className="comment-reply-form">
          <MentionTextarea value={editText} onChange={setEditText} members={members} rows={2} autoFocus />
          <div className="comment-reply-actions">
            <button type="button" className="btn" onClick={() => setEditOpen(false)} disabled={sending}>
              {pick(language, "Cancelar", "Cancel", "Cancelar")}
            </button>
            <button type="button" className="btn btn-primary" onClick={submitEdit} disabled={sending || !editText.trim()}>
              {pick(language, "Guardar", "Save", "Gardar")}
            </button>
          </div>
        </div>
      ) : (
        <p className="comment-text"><Linkify text={comment.text} /></p>
      )}

      <div className="comment-actions">
        <VoteControl reactions={comment.reactions} onVote={(dir) => onReact(comment.id, dir)} />
        <button type="button" className="comment-reply-btn" onClick={() => setReplyOpen((v) => !v)}>
          {pick(language, "Responder", "Reply", "Responder")}
        </button>
        {isAdmin && onPin && !isReply ? (
          <button type="button" className={`comment-reply-btn comment-pin-btn${comment.pinned ? " is-on" : ""}`} onClick={() => onPin(comment.id, !comment.pinned)}>
            <Icon name="star" size={12} /> {comment.pinned ? pick(language, "Quitar", "Unpin", "Quitar") : pick(language, "Destacar", "Feature", "Destacar")}
          </button>
        ) : null}
        {isMine ? (
          <button type="button" className="comment-reply-btn" onClick={() => { setEditText(comment.text); setEditOpen(true); }}>
            {pick(language, "Editar", "Edit", "Editar")}
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className="comment-reply-btn comment-del-btn"
            onClick={async () => {
              const ok = await confirm({
                title: isMine
                  ? pick(language, "¿Borrar este comentario?", "Delete this comment?", "Borrar este comentario?")
                  : pick(language, "¿Borrar este comentario (moderación)?", "Delete this comment (moderation)?", "Borrar este comentario (moderación)?"),
                confirmLabel: pick(language, "Borrar", "Delete", "Borrar"),
                danger: true
              });
              if (ok) onDelete(comment.id);
            }}
          >
            {pick(language, "Borrar", "Delete", "Borrar")}
          </button>
        ) : null}
      </div>

      {replyOpen ? (
        <div className="comment-reply-form">
          <MentionTextarea
            value={replyText}
            onChange={setReplyText}
            members={members}
            rows={2}
            autoFocus
            placeholder={pick(language, "Tu respuesta... (@ para mencionar)", "Your reply... (@ to mention)", "A túa resposta... (@ para mencionar)")}
          />
          <div className="comment-reply-actions">
            <button type="button" className="btn" onClick={() => setReplyOpen(false)} disabled={sending}>
              {pick(language, "Cancelar", "Cancel", "Cancelar")}
            </button>
            <button type="button" className="btn btn-primary" onClick={submitReply} disabled={sending || !replyText.trim()}>
              {pick(language, "Responder", "Reply", "Responder")}
            </button>
          </div>
        </div>
      ) : null}
    </m.li>
  );
};

// Renderiza un hilo (raíces + respuestas) sin agrupar por capítulo. Para los hilos
// inline que cuelgan de una anotación.
export const NoteThread = ({
  comments,
  members,
  activeUserId,
  isAdmin = false,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin
}: {
  comments: BookComment[];
  members: ClubMemberLite[];
  activeUserId: string;
  isAdmin?: boolean;
  onReply: (parentId: string, text: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => void;
  onEdit: (commentId: string, text: string) => Promise<void>;
  onDelete: (commentId: string) => void;
  onPin?: (commentId: string, pinned: boolean) => void;
}) => {
  // Destacados primero (mantiene el orden por fecha dentro de cada grupo).
  const roots = comments.filter((c) => !c.parentId).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  if (roots.length === 0) return null;
  const repliesByParent = new Map<string, BookComment[]>();
  comments.forEach((c) => {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  });
  const itemProps = { members, activeUserId, isAdmin, onReply, onReact, onEdit, onDelete, onPin };
  return (
    <ul className="comment-thread note-thread">
      {roots.map((root) => (
        <li key={root.id} className="comment-root">
          <ul className="comment-thread-inner">
            <CommentItem comment={root} {...itemProps} isReply={false} />
            {(repliesByParent.get(root.id) ?? []).map((reply) => (
              <CommentItem key={reply.id} comment={reply} {...itemProps} isReply />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
};
