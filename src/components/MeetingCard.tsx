import { useState } from "react";
import { pick, useI18n } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";
import type { ClubBook, MeetingRsvp } from "../lib/communityApi";
import { Icon } from "./Icon";
import { UserDot } from "./UserBadge";

// ── .ics: el calendario del móvil recuerda la cita aunque no abras la app ──
const icsStamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEscape = (s: string): string => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
const downloadIcs = (title: string, startMs: number, place?: string, url?: string): void => {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//wee//club de lectura//ES", "BEGIN:VEVENT",
    `UID:${startMs}-${Math.floor(startMs / 1000)}@wee`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(startMs)}`,
    `DTEND:${icsStamp(startMs + 90 * 60 * 1000)}`,
    `SUMMARY:${icsEscape(title)}`,
    place ? `LOCATION:${icsEscape(place)}` : "",
    url ? `URL:${url}` : "",
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cita-club.ics";
  a.click();
  URL.revokeObjectURL(a.href);
};

// datetime-local <-> ISO (respetando la hora LOCAL del usuario)
const toLocalInput = (ms?: number): string => {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const formatWhen = (ms: number, language: AppLanguage): string =>
  new Date(ms).toLocaleString(language === "en" ? "en-GB" : "es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// Diferencia en DÍAS DE CALENDARIO (no ventanas de 24h): un evento hoy a las
// 22:22 visto a mediodía son ~10h → antes Math.ceil lo redondeaba a 1 y decía
// "es mañana". Comparando medianoche local sale 0 = hoy.
const meetingDayInfo = (ms: number): { passed: boolean; days: number } => {
  const passed = ms < Date.now();
  const a = new Date(ms); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const days = Math.round((a.getTime() - b.getTime()) / 86400000);
  return { passed, days };
};
const countdown = (ms: number, language: AppLanguage): string => {
  const { passed, days } = meetingDayInfo(ms);
  if (passed) return pick(language, "ya pasó", "already passed", "xa pasou");
  if (days <= 0) return pick(language, "es hoy", "it's today", "é hoxe");
  if (days === 1) return pick(language, "es mañana", "it's tomorrow", "é mañá");
  return pick(language, `faltan ${days} días`, `${days} days to go`, `faltan ${days} días`);
};

interface MeetingCardProps {
  book: ClubBook;
  rsvp?: MeetingRsvp;
  canManage: boolean;
  onSetMeeting: (input: { meetingAt?: string | null; meetingUrl?: string | null; meetingPlace?: string | null }) => Promise<void>;
  onRsvp: (status: "yes" | "no" | null) => void;
  busy?: boolean;
}

export const MeetingCard = ({ book, rsvp, canManage, onSetMeeting, onRsvp, busy = false }: MeetingCardProps) => {
  const { language } = useI18n();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(toLocalInput(book.meetingAt));
  const [place, setPlace] = useState(book.meetingPlace ?? "");
  const [url, setUrl] = useState(book.meetingUrl ?? "");
  const has = !!book.meetingAt;

  const save = async () => {
    const iso = when ? new Date(when).toISOString() : null;
    await onSetMeeting({ meetingAt: iso, meetingPlace: place.trim() || null, meetingUrl: url.trim() || null });
    setEditing(false);
  };
  const cancelMeeting = async () => {
    await onSetMeeting({ meetingAt: null });
    setEditing(false);
  };

  const form = (
    <div className="meeting-form">
      <label>
        {pick(language, "Fecha y hora", "Date and time", "Data e hora")}
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label>
        {pick(language, "Dónde (opcional)", "Where (optional)", "Onde (opcional)")}
        <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={pick(language, "Casa de Ana, bar, videollamada...", "Ana's place, a bar, video call...", "Casa de Ana, bar, videochamada...")} />
      </label>
      <label>
        {pick(language, "Enlace de videollamada (opcional)", "Video call link (optional)", "Ligazón de videochamada (opcional)")}
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet..." />
      </label>
      <div className="meeting-form-actions">
        {has ? <button type="button" className="btn meeting-cancel" onClick={() => void cancelMeeting()} disabled={busy}>{pick(language, "Quitar cita", "Remove date", "Quitar cita")}</button> : null}
        <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy}>{pick(language, "Cancelar", "Cancel", "Cancelar")}</button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !when}>{pick(language, "Guardar cita", "Save date", "Gardar cita")}</button>
      </div>
    </div>
  );

  const info = has ? meetingDayInfo(book.meetingAt as number) : null;
  const isToday = !!info && !info.passed && info.days === 0;
  const isGoing = rsvp?.mine === "yes";

  return (
    <section className={`page-section meeting-card${isToday ? " meeting-today" : ""}`}>
      <div className="section-head">
        <h3>
          <Icon name="users" /> {pick(language, "La cita del club", "The club's meet-up", "A cita do club")}
          {isToday ? <span className="meeting-today-badge">{pick(language, "HOY", "TODAY", "HOXE")}</span> : null}
        </h3>
        {/* Acciones del header: Editar (solo el creador) + campana de calendario
            (solo si vas), en línea a la derecha. */}
        {(has && canManage && !editing) || (has && !editing && isGoing) ? (
          <div className="meeting-head-actions">
            {has && canManage && !editing ? (
              <button type="button" className="btn btn-tiny" onClick={() => setEditing(true)}>{pick(language, "Editar", "Edit", "Editar")}</button>
            ) : null}
            {has && !editing && isGoing ? (
              <button
                type="button"
                className="meeting-cal-btn"
                onClick={() => downloadIcs(`${pick(language, "Club:", "Club:", "Club:")} ${book.title}`, book.meetingAt as number, book.meetingPlace, book.meetingUrl)}
                aria-label={pick(language, "Añadir a mi calendario", "Add to my calendar", "Engadir ao meu calendario")}
                title={pick(language, "Añadir a mi calendario", "Add to my calendar", "Engadir ao meu calendario")}
              >
                <Icon name="bell" size={15} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing ? (
        form
      ) : has ? (
        <>
          <p className="meeting-when">
            <strong>{formatWhen(book.meetingAt as number, language)}</strong>
            {/* Si es hoy, el badge "HOY" del título ya lo dice → no repitas. */}
            {!isToday ? <span className="meeting-countdown"> · {countdown(book.meetingAt as number, language)}</span> : null}
          </p>
          {book.meetingPlace ? <p className="meeting-place"><Icon name="target" size={13} /> {book.meetingPlace}</p> : null}
          {book.meetingUrl ? (
            <a className="btn btn-primary meeting-join-btn" href={book.meetingUrl} target="_blank" rel="noopener noreferrer nofollow"><Icon name="link" size={13} /> {pick(language, "Entrar a la videollamada", "Join the video call", "Entrar á videochamada")}</a>
          ) : null}
          <div className="meeting-rsvp">
            <button type="button" className={`btn${isGoing ? " btn-primary" : ""}`} disabled={busy} onClick={() => onRsvp(isGoing ? null : "yes")}>
              <Icon name="check" size={13} /> {pick(language, "Voy", "I'm in", "Vou")}
            </button>
            <button type="button" className={`btn${rsvp?.mine === "no" ? " is-on" : ""}`} disabled={busy} onClick={() => onRsvp(rsvp?.mine === "no" ? null : "no")}>
              {pick(language, "No puedo", "Can't make it", "Non podo")}
            </button>
          </div>
          {rsvp && rsvp.going > 0 ? (
            <div className="meeting-going">
              <span className="meeting-going-stack">
                {rsvp.goingAliases.slice(0, 7).map((alias, i) => (
                  <UserDot key={`${alias}-${i}`} alias={alias} colorIndex={i} title={alias} />
                ))}
              </span>
              <span className="hint">{pick(language, `Van ${rsvp.going}`, `${rsvp.going} going`, `Van ${rsvp.going}`)}</span>
            </div>
          ) : null}
        </>
      ) : canManage ? (
        <>
          <p className="hint">{pick(language, "Poned fecha para juntaros a comentar el libro.", "Set a date to meet and discuss the book.", "Poñede data para xuntarvos a comentar o libro.")}</p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>{pick(language, "Fijar la cita", "Set the date", "Fixar a cita")}</button>
        </>
      ) : (
        <p className="hint">{pick(language, "Aún no hay cita. La fijará quien propuso el libro.", "No date yet. The book's facilitator will set it.", "Aínda non hai cita. Fixaraa quen propuxo o libro.")}</p>
      )}
    </section>
  );
};
