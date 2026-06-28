import { pick, useI18n } from "../lib/i18n";
import type { CommentReaction } from "../lib/communityApi";
import { Icon } from "./Icon";

// El "voto" se guarda en la tabla de reacciones con emoji "up"/"down".
export const scoreOf = (reactions: CommentReaction[]): number => {
  const up = reactions.find((r) => r.emoji === "up")?.count ?? 0;
  const down = reactions.find((r) => r.emoji === "down")?.count ?? 0;
  return up - down;
};

export const myVoteOf = (reactions: CommentReaction[]): "up" | "down" | null => {
  if (reactions.find((r) => r.emoji === "up")?.mine) return "up";
  if (reactions.find((r) => r.emoji === "down")?.mine) return "down";
  return null;
};

// Toggle local exclusivo (optimista): re-votar la misma dirección la quita; la opuesta cambia.
export const applyVoteLocal = (reactions: CommentReaction[], dir: "up" | "down"): CommentReaction[] => {
  const current = myVoteOf(reactions);
  const cleared = reactions.map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0);
  if (current === dir) return cleared;
  const existing = cleared.find((r) => r.emoji === dir);
  if (existing) return cleared.map((r) => (r.emoji === dir ? { ...r, count: r.count + 1, mine: true } : r));
  return [...cleared, { emoji: dir, count: 1, mine: true }];
};

export const VoteControl = ({ reactions, onVote }: { reactions: CommentReaction[]; onVote: (dir: "up" | "down") => void }) => {
  const { language } = useI18n();
  const score = scoreOf(reactions);
  const mine = myVoteOf(reactions);
  return (
    <div className="vote-control">
      <button
        type="button"
        className={`vote-arrow${mine === "up" ? " is-up" : ""}`}
        aria-pressed={mine === "up"}
        aria-label={pick(language, "Votar a favor", "Upvote", "Votar a favor")}
        onClick={() => onVote("up")}
      >
        <Icon name="arrowUp" size={15} />
      </button>
      <span className={`vote-score${mine === "up" ? " is-up" : mine === "down" ? " is-down" : ""}`}>{score}</span>
      <button
        type="button"
        className={`vote-arrow${mine === "down" ? " is-down" : ""}`}
        aria-pressed={mine === "down"}
        aria-label={pick(language, "Votar en contra", "Downvote", "Votar en contra")}
        onClick={() => onVote("down")}
      >
        <Icon name="arrowDown" size={15} />
      </button>
    </div>
  );
};
