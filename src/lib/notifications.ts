import { createContext, useContext } from "react";

export interface AppNotification {
  id: string;
  kind: "mention" | "reply" | "reaction" | "note_comment" | "book_proposed" | "book_approved" | "book_finished" | "join_approved" | "promoted" | "reminder" | "meeting_set";
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
