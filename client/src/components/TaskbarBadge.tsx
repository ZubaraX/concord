import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useUnread } from "../store/unread";

interface Pending {
  incoming: { id: string }[];
  outgoing: { id: string }[];
}

// Draws a red unread badge and pushes it to the OS taskbar/dock icon. Counts
// unread messages plus incoming friend requests. Desktop only (no-op on web).
function badgeDataUrl(count: number): string {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#f23f43";
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(count > 9 ? "9+" : String(count), 16, 17);
  return c.toDataURL("image/png");
}

export default function TaskbarBadge() {
  const counts = useUnread((s) => s.counts);
  const unreadTotal = Object.values(counts).reduce((a, b) => a + (b || 0), 0);

  const { data: pending } = useQuery<Pending>({
    queryKey: ["friends", "pending"],
    queryFn: () => api<Pending>("/api/friends/pending"),
    staleTime: 30_000,
  });
  const requests = pending?.incoming.length ?? 0;
  const total = unreadTotal + requests;

  useEffect(() => {
    const setBadge = window.concord?.setBadge;
    if (!setBadge) return;
    if (total > 0) setBadge(badgeDataUrl(total), total);
    else setBadge(null, 0);
  }, [total]);

  return null;
}
