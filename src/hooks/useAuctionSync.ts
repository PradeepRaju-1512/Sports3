import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LiveAuctionDelta,
  LiveAuctionSnapshot,
} from "../types/auction";

function applyDelta(
  prev: LiveAuctionSnapshot | null,
  delta: LiveAuctionDelta
): LiveAuctionSnapshot | null {
  if (!prev) return prev;
  // Monotonic version check: ignore stale out-of-order deltas
  if (delta.version < (prev.version || 0)) return prev;

  let nextRegistrations = prev.registrations;
  if (delta.updatedRegistration) {
    const upd = delta.updatedRegistration;
    const exists = prev.registrations.some((r) => r.id === upd.id);
    nextRegistrations = exists
      ? prev.registrations.map((r) => (r.id === upd.id ? upd : r))
      : [...prev.registrations, upd];
  } else if (delta.removedRegistrationId) {
    nextRegistrations = prev.registrations.filter(
      (r) => r.id !== delta.removedRegistrationId
    );
  }

  let nextBidHistory = prev.bidHistory;
  if (delta.bidHistoryTail) {
    // Merge tail smoothly (keeps any older history beyond 20 if present)
    const tailIds = new Set(delta.bidHistoryTail.map((b) => b.id));
    const older = prev.bidHistory.filter((b) => !tailIds.has(b.id));
    nextBidHistory = [...delta.bidHistoryTail, ...older].slice(0, 120);
  } else if (delta.latestBidEvent) {
    const exists = prev.bidHistory.some(
      (b) => b.id === delta.latestBidEvent!.id
    );
    if (!exists) {
      nextBidHistory = [delta.latestBidEvent, ...prev.bidHistory].slice(0, 120);
    }
  }

  return {
    version: delta.version,
    auction: delta.auction,
    rounds: delta.rounds || prev.rounds,
    registrations: nextRegistrations,
    franchises: delta.franchises,
    bidHistory: nextBidHistory,
    serverTime: delta.serverTime,
  };
}

export function useAuctionSync() {
  const [snapshot, setSnapshot] = useState<LiveAuctionSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const connectedRef = useRef(false);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/auction/live-state", { cache: "no-store" });
      if (!res.ok) {
        setError("Unable to load live auction state.");
        return;
      }
      const data: LiveAuctionSnapshot = await res.json();
      setSnapshot(data);
      setError(null);
    } catch {
      setError("Network error connecting to live auction feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/auction/stream");

      es.addEventListener("snapshot", (ev) => {
        try {
          const parsed: LiveAuctionSnapshot = JSON.parse(
            (ev as MessageEvent).data
          );
          setSnapshot(parsed);
          setConnected(true);
          connectedRef.current = true;
          setLoading(false);
          setError(null);
        } catch {
          // ignore malformed packet
        }
      });

      es.addEventListener("delta", (ev) => {
        try {
          const delta: LiveAuctionDelta = JSON.parse((ev as MessageEvent).data);
          setConnected(true);
          connectedRef.current = true;
          setError(null);
          setSnapshot((prev) => {
            if (!prev) {
              void fetchLatest();
              return prev;
            }
            return applyDelta(prev, delta);
          });
        } catch {
          // ignore malformed packet
        }
      });

      es.onopen = () => {
        setConnected(true);
        connectedRef.current = true;
      };

      es.onerror = () => {
        setConnected(false);
        connectedRef.current = false;
      };
    } catch {
      setConnected(false);
      connectedRef.current = false;
    }

    // Fallback poll ONLY when SSE is disconnected (every 20s, never 2s!)
    const poll = window.setInterval(() => {
      if (!connectedRef.current) {
        void fetchLatest();
      }
    }, 20_000);

    const onVisChange = () => {
      if (document.visibilityState === "visible" && !connectedRef.current) {
        void fetchLatest();
      }
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisChange);
      if (es) es.close();
    };
  }, [fetchLatest]);

  return {
    snapshot,
    connected,
    loading,
    error,
    refresh: fetchLatest,
    applySnapshot: setSnapshot,
  };
}