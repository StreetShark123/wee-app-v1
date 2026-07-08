import { createContext, useContext } from "react";
import { pick } from "./i18n";
import type { AppLanguage } from "./types";

export interface AppNotification {
  id: string;
  kind: "mention" | "reply" | "reaction" | "note_comment" | "book_proposed" | "book_approved" | "book_finished" | "join_approved" | "promoted" | "reminder" | "meeting_set" | "member_joined";
  bookId?: string;
  commentId?: string;
  bookTitle?: string;
  actorAlias: string;
  text?: string;
  readAt?: number;
  createdAt: number;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllAsRead: () => void;
}

const defaultValue: NotificationsContextValue = {
  notifications: [],
  unreadCount: 0,
  markAllAsRead: () => {}
};

export const NotificationsContext = createContext<NotificationsContextValue>(defaultValue);

export const useNotifications = (): NotificationsContextValue => useContext(NotificationsContext);

// Destino de la notificación: al evento concreto (comentario anclado) o, si no,
// al libro. Fuera de un libro (join/promoted) cae a la home.
export const notificationHref = (n: AppNotification): string =>
  n.bookId ? `/book/${n.bookId}${n.commentId ? `#c-${n.commentId}` : ""}` : "/home";

// Texto humano de la notificación personal ("para ti"). Centralizado aquí para
// que lo compartan las superficies que la muestren.
export const notificationLabel = (n: AppNotification, language: AppLanguage): string => {
  const who = n.actorAlias;
  switch (n.kind) {
    case "mention":
      return pick(language, `${who} te mencionó`, `${who} mentioned you`, `${who} mencionoute`);
    case "reply":
      return pick(language, `${who} respondió a tu comentario`, `${who} replied to your comment`, `${who} respondeu ao teu comentario`);
    case "reaction":
      return pick(language, `A ${who} le gustó tu comentario`, `${who} liked your comment`, `A ${who} gustoulle o teu comentario`);
    case "note_comment":
      return pick(language, `${who} comentó tu nota`, `${who} commented on your note`, `${who} comentou a túa nota`);
    case "meeting_set":
      return pick(language, "Hay cita para comentar un libro", "There's a date to discuss a book", "Hai cita para comentar un libro");
    case "reminder":
      return pick(language, "Recordatorio: una propuesta espera tu voto", "Reminder: a proposal is waiting for your vote", "Recordatorio: hai unha proposta esperando o teu voto");
    case "book_proposed":
      return pick(language, `${who} propuso un libro: ¡vota!`, `${who} proposed a book — vote!`, `${who} propuxo un libro: vota!`);
    case "book_approved":
      return pick(language, "El club va a leer un libro nuevo", "The club is reading a new book", "O club vai ler un libro novo");
    case "book_finished":
      return pick(language, "¡El club terminó un libro!", "The club finished a book!", "O club rematou un libro!");
    case "join_approved":
      return pick(language, "Te han aceptado en el club", "You've been accepted into the club", "Aceptáronte no club");
    case "member_joined":
      return pick(language, `${who} se unió al club`, `${who} joined the club`, `${who} uniuse ao club`);
    default:
      return pick(language, "Ahora eres admin del club", "You're now a club admin", "Agora es admin do club");
  }
};
