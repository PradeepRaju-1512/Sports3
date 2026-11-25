import { useCallback, useEffect, useRef, useState } from "react";

export interface LiveMatchSummary {
  id: number;
  tournamentId: number;
  sportName: string;
  stage: string;
  matchOrder: number;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
  status: string;
  scheduledTime: string;
  scheduledAt?: string | null;
  venue: string;
  resultSummary: string;
  detailedBreakdown: string;
  scorerUserId: number | null;
  version?: number;
  clockAnchorMs?: number | null;
  clockAccumulatedMs?: number;
  clockRunning?: boolean;
  updatedAt?: string;
}

export interface LiveNavSnapshot {
  hasLiveMatches: boolean;
  showAuctionInNav: boolean;
  showLiveAuctionInNav: boolean;
  auctionStatus: string;
  alertBanner: string | null;
}

export function useLiveMatchesStream(options?: {
  onNavUpdate?: (nav: LiveNavSnapshot) => void;
  onMatchUpdate?: () => void;
}) {
  const [live, setLive] = useState<LiveMatchSummary[]>([]);
  const [upcoming, setUpcoming] = useState<LiveMatchSummary[]>([]);
  const [nav, setNav] = useState<LiveNavSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connectedRef = useRef(false);
  const onNavUpdateRef = useRef(options?.onNavUpdate);
  const onMatchUpdateRef = useRef(options?.onMatchUpdate);
  onNavUpdateRef.current = options?.onNavUpdate;
  onMatchUpdateRef.current = options?.onMatchUpdate;

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/matches/live-and-upcoming", {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Unable to load match schedule.");
        return;
      }
      const d = await res.json();
      setLive(d.live || []);
      setUpcoming(d.upcoming || []);
      setError(null);
    } catch {
      setError("Network error refreshing match feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLatest();

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/matches/stream");

      es.addEventListener("snapshot", (ev) => {
        try {
          const parsed = JSON.parse((ev as MessageEvent).data);
          if (Array.isArray(parsed.live)) setLive(parsed.live);
          if (Array.isArray(parsed.upcoming)) setUpcoming(parsed.upcoming);
          if (parsed.nav) {
            setNav(parsed.nav);
            onNavUpdateRef.current?.(parsed.nav);
          }
          setConnected(true);
          connectedRef.current = true;
          setLoading(false);
          setError(null);
        } catch {
          // ignore malformed event
        }
      });

      es.addEventListener("match_update", (ev) => {
        try {
          const parsed = JSON.parse((ev as MessageEvent).data);
          if (Array.isArray(parsed.live)) setLive(parsed.live);
          if (Array.isArray(parsed.upcoming)) setUpcoming(parsed.upcoming);
          if (parsed.nav) {
            setNav(parsed.nav);
            onNavUpdateRef.current?.(parsed.nav);
          }
          onMatchUpdateRef.current?.();
          setConnected(true);
          connectedRef.current = true;
          setError(null);
        } catch {
          // ignore
        }
      });

      es.addEventListener("nav_update", (ev) => {
        try {
          const parsed: LiveNavSnapshot = JSON.parse((ev as MessageEvent).data);
          setNav(parsed);
          onNavUpdateRef.current?.(parsed);
        } catch {
          // ignore
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

    // Fallback polling ONLY when SSE is disconnected
    const poll = window.setInterval(() => {
      if (!connectedRef.current) {
        void fetchLatest();
      }
    }, 20_000);

    const onVis = () => {
      if (document.visibilityState === "visible" && !connectedRef.current) {
        void fetchLatest();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      if (es) es.close();
    };
  }, [fetchLatest]);

  return {
    live,
    upcoming,
    nav,
    connected,
    loading,
    error,
    refresh: fetchLatest,
  };
}
