import { useMemo } from "react";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import type { Message, PollData } from "../types";

// Renders a poll "message" (empty content, pollJson populated) — question,
// options as click-to-vote bars. Single choice: picking a new option clears
// any previous vote (handled server-side).
export default function PollView({ message }: { message: Message }) {
  const { user } = useAuth();
  const poll = useMemo<PollData | null>(() => {
    try {
      return message.pollJson ? JSON.parse(message.pollJson) : null;
    } catch {
      return null;
    }
  }, [message.pollJson]);
  if (!poll) return null;

  const total = Object.values(poll.votes).reduce((n, v) => n + v.length, 0);
  const myVote = Object.entries(poll.votes).find(([, uids]) => uids.includes(user?.id ?? ""))?.[0];

  function vote(optionId: string) {
    api(`/api/messages/${message.id}/poll/vote`, { method: "PUT", body: JSON.stringify({ optionId }) }).catch(() => {});
  }

  return (
    <div className="mt-1 max-w-md rounded-lg border border-black/20 bg-discord-card p-3">
      <div className="mb-2 flex items-center gap-2 font-semibold text-white">
        <span className="text-lg">📊</span> {poll.question}
      </div>
      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const count = poll.votes[o.id]?.length ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = myVote === o.id;
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              className={`relative block w-full overflow-hidden rounded px-3 py-1.5 text-left text-sm transition ${
                mine ? "ring-1 ring-discord-accent" : "hover:ring-1 hover:ring-discord-hover"
              }`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-discord-accent/25 transition-all"
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2 text-discord-text">
                <span className="truncate">{mine && "✓ "}{o.label}</span>
                <span className="shrink-0 text-xs text-discord-muted">{count} · {pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-xs text-discord-faint">
        {total} {total === 1 ? "голос" : total < 5 ? "голоса" : "голосов"}
      </div>
    </div>
  );
}
