import { useState } from "react";
import type { BookComment, ClubMemberLite } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Linkify } from "./Linkify";
import { MentionTextarea } from "./MentionTextarea";

const PRESET_EMOJIS = ["👍", "❤️", "🔥", "😍", "🤔", "💡", "😂", "😮", "😢", "👏", "🙌", "💯", "📖", "🤯", "✨", "🥲"];

interface CommentThreadProps {
  comments: BookComment[];
  members: ClubMemberLite[];
  activeUserId: string;
  onReply: (parentId: string, text: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => void;
  onEdit: (commentId: string, text: string) => Promise<void>;
  onDelete: (commentId: string) => void;
}

const CommentItem = ({
  comment,
  members,
  activeUserId,
  onReply,
  onReact,
  onEdit,
  onDelete,
  isReply
}: {
  comment: BookComment;
  members: ClubMemberLite[];
  activeUserId: string;
  onReply: (parentId: string, text: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => void;
  onEdit: (commentId: string, text: string) => Promise<void>;
  onDelete: (commentId: string) => void;
  isReply: boolean;
}) => {
  const { language } = useI18n();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const isMine = comment.userId === activeUserId;
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

  return (
    <li className={`comment-item${isReply ? " comment-item-reply" : ""}`}>
      <div className="comment-head">
        <strong>{comment.alias}</strong>
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
        {comment.reactions.map((r) => (
          <button
            key={`${r.emoji}-${r.count}-${r.mine ? 1 : 0}`}
            type="button"
            className={`reaction-chip reaction-pop${r.mine ? " is-mine" : ""}`}
            onClick={() => onReact(comment.id, r.emoji)}
            aria-pressed={r.mine}
            aria-label={pick(language, `${r.emoji}, ${r.count}${r.mine ? ", tu reacción" : ""}`, `${r.emoji}, ${r.count}${r.mine ? ", your reaction" : ""}`, `${r.emoji}, ${r.count}`)}
            title={r.mine ? pick(language, "Quitar tu reacción", "Remove your reaction", "Quitar a túa reacción") : pick(language, "Reaccionar", "React", "Reaccionar")}
          >
            <span aria-hidden="true">{r.emoji}</span> <span className="reaction-count">{r.count}</span>
          </button>
        ))}
        <div className="reaction-add">
          <button type="button" className="reaction-chip reaction-add-btn" aria-label={pick(language, "Añadir reacción", "Add reaction", "Engadir reacción")} aria-expanded={pickerOpen} onClick={() => setPickerOpen((v) => !v)}>
            <Icon name="heart" size={13} /> <span aria-hidden="true">+</span>
          </button>
          {pickerOpen ? (
            <div className="reaction-picker" role="menu">
              {PRESET_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="reaction-emoji"
                  onClick={() => {
                    onReact(comment.id, e);
                    setPickerOpen(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className="comment-reply-btn" onClick={() => setReplyOpen((v) => !v)}>
          {pick(language, "Responder", "Reply", "Responder")}
        </button>
        {isMine ? (
          <>
            <button type="button" className="comment-reply-btn" onClick={() => { setEditText(comment.text); setEditOpen(true); }}>
              {pick(language, "Editar", "Edit", "Editar")}
            </button>
            <button
              type="button"
              className="comment-reply-btn comment-del-btn"
              onClick={() => {
                if (window.confirm(pick(language, "¿Borrar este comentario?", "Delete this comment?", "Borrar este comentario?"))) onDelete(comment.id);
              }}
            >
              {pick(language, "Borrar", "Delete", "Borrar")}
            </button>
          </>
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
    </li>
  );
};

export const CommentThread = ({ comments, members, activeUserId, onReply, onReact, onEdit, onDelete }: CommentThreadProps) => {
  const roots = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, BookComment[]>();
  comments.forEach((c) => {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  });

  const itemProps = { members, activeUserId, onReply, onReact, onEdit, onDelete };

  return (
    <ul className="comment-thread">
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
