import { useEffect, useState } from "react";
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
  readChapterIds: Set<string>;
  chapterLabelById: Map<string, string>;
  noteById: Map<string, { alias: string; text: string }>;
  focusCommentId?: string | null;
  onReply: (parentId: string, text: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => void;
  onEdit: (commentId: string, text: string) => Promise<void>;
  onDelete: (commentId: string) => void;
}

const CommentItem = ({
  comment,
  members,
  activeUserId,
  chapterLabel,
  onReply,
  onReact,
  onEdit,
  onDelete,
  isReply
}: {
  comment: BookComment;
  members: ClubMemberLite[];
  activeUserId: string;
  chapterLabel?: string;
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

  if (comment.deleted) {
    return (
      <li id={`c-${comment.id}`} className={`comment-item comment-tombstone${isReply ? " comment-item-reply" : ""}`}>
        <p className="comment-deleted"><Icon name="trash" size={12} /> {pick(language, "Comentario eliminado por el autor", "Comment deleted by its author", "Comentario eliminado polo autor")}</p>
      </li>
    );
  }

  return (
    <li id={`c-${comment.id}`} className={`comment-item${isReply ? " comment-item-reply" : ""}`}>
      <div className="comment-head">
        <strong>{comment.alias}</strong>
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

const GENERAL_KEY = "__general__";

export const CommentThread = ({ comments, members, activeUserId, readChapterIds, chapterLabelById, noteById, focusCommentId, onReply, onReact, onEdit, onDelete }: CommentThreadProps) => {
  const { language } = useI18n();
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});

  // "Ver hilo": al enfocar un comentario, abre el grupo de su capítulo SOLO si ya lo
  // has leído (anti-spoiler: nunca revelar comentarios de un capítulo sin leer).
  useEffect(() => {
    if (!focusCommentId) return;
    const target = comments.find((c) => c.id === focusCommentId);
    if (!target) return;
    const key = target.chapterId ?? GENERAL_KEY;
    const isRead = key === GENERAL_KEY || readChapterIds.has(key);
    if (isRead) setOpenOverride((prev) => ({ ...prev, [key]: true }));
  }, [focusCommentId, comments, readChapterIds]);

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

  // Agrupar hilos por capítulo (los sin capítulo van al grupo "general").
  const groups = new Map<string, BookComment[]>();
  roots.forEach((root) => {
    const key = root.chapterId ?? GENERAL_KEY;
    const arr = groups.get(key) ?? [];
    arr.push(root);
    groups.set(key, arr);
  });
  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === GENERAL_KEY) return -1;
    if (b === GENERAL_KEY) return 1;
    return Number(chapterLabelById.get(a) ?? 0) - Number(chapterLabelById.get(b) ?? 0);
  });

  const renderThread = (root: BookComment) => {
    const note = root.noteId ? noteById.get(root.noteId) : undefined;
    return (
      <li key={root.id} className="comment-root">
        {note ? (
          <div className="comment-note-header">
            <span className="comment-note-header-label">{pick(language, `Sobre la anotación de ${note.alias}`, `On ${note.alias}'s note`, `Sobre a anotación de ${note.alias}`)}</span>
            {note.text ? <p className="comment-note-header-text">«{note.text}»</p> : null}
          </div>
        ) : null}
        <ul className="comment-thread-inner">
          <CommentItem comment={root} {...itemProps} isReply={false} />
          {(repliesByParent.get(root.id) ?? []).map((reply) => (
            <CommentItem key={reply.id} comment={reply} {...itemProps} isReply />
          ))}
        </ul>
      </li>
    );
  };

  return (
    <div className="comment-groups">
      {groupKeys.map((key) => {
        const groupRoots = groups.get(key) ?? [];
        const isGeneral = key === GENERAL_KEY;
        // Anti-spoiler: un grupo de capítulo arranca COLAPSADO salvo que lo hayas leído.
        const isRead = isGeneral || readChapterIds.has(key);
        const open = openOverride[key] ?? isRead;
        const label = isGeneral
          ? pick(language, "General del libro", "About the book", "Xeral do libro")
          : pick(language, `Capítulo ${chapterLabelById.get(key) ?? "?"}`, `Chapter ${chapterLabelById.get(key) ?? "?"}`, `Capítulo ${chapterLabelById.get(key) ?? "?"}`);
        return (
          <section key={key} className={`comment-group${!isRead ? " comment-group-spoiler" : ""}`}>
            <button
              type="button"
              className="comment-group-head"
              aria-expanded={open}
              onClick={() => setOpenOverride((prev) => ({ ...prev, [key]: !open }))}
            >
              <span className={`comment-group-caret${open ? "" : " is-collapsed"}`} aria-hidden="true">▾</span>
              <span className="comment-group-title">{label}</span>
              <span className="comment-group-count">{groupRoots.length}</span>
              {!isRead ? (
                <span className="comment-group-warn"><Icon name="eyeOff" size={11} /> {pick(language, "sin leer", "unread", "sen ler")}</span>
              ) : null}
            </button>
            {open ? (
              <>
                {!isRead ? (
                  <p className="comment-group-spoiler-note">{pick(language, "Aún no has marcado este capítulo: puede haber spoilers.", "You haven't marked this chapter yet: there may be spoilers.", "Aínda non marcaches este capítulo: pode haber spoilers.")}</p>
                ) : null}
                <ul className="comment-thread">{groupRoots.map(renderThread)}</ul>
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
};
