import { useEffect, useState } from "react";

import { buildSessionAnalytics } from "../lib/requestAnalysis";
import { encodeSessionRouteId, sessionKey } from "../lib/routing";
import type { CaptureRecord, SessionAnalytics, SessionListItem } from "../types";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/sessions");
        if (!response.ok) {
          throw new Error(`Failed to load sessions (${response.status})`);
        }

        const payload = (await response.json()) as { sessions: SessionListItem[] };
        if (!cancelled) {
          setSessions(payload.sessions);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  return { sessions, loading, error };
}

export function useSessionDetails(sessions: SessionListItem[]) {
  const [details, setDetails] = useState<Record<string, SessionAnalytics>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      const missingSessions = sessions.filter((session) => !details[sessionKey(session.sessionId)]);
      if (missingSessions.length === 0) {
        return;
      }

      const loadedEntries = await Promise.all(
        missingSessions.map(async (session) => {
          const response = await fetch(`/api/sessions/${encodeSessionRouteId(session.sessionId)}`);
          if (!response.ok) {
            throw new Error(`Failed to load session ${session.sessionId ?? "~missing"}`);
          }

          const payload = (await response.json()) as { captures: CaptureRecord[] };
          return [sessionKey(session.sessionId), buildSessionAnalytics(payload.captures)] as const;
        }),
      ).catch(() => []);

      if (!cancelled && loadedEntries.length > 0) {
        setDetails((current) => ({
          ...current,
          ...Object.fromEntries(loadedEntries),
        }));
      }
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [details, sessions]);

  return details;
}

export function useSessionCaptures(sessionId: string | null) {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/sessions/${encodeSessionRouteId(sessionId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load session (${response.status})`);
        }

        const payload = (await response.json()) as { captures: CaptureRecord[] };
        if (!cancelled) {
          setCaptures(payload.captures);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { captures, loading, error };
}
