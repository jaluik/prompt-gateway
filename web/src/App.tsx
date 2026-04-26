import { useEffect, useState } from "react";

import { useSessionDetails, useSessions } from "./hooks/useSessions";
import { parseRoute } from "./lib/routing";
import { DetailPage } from "./pages/detail/DetailPage";
import { ListPage } from "./pages/list/ListPage";
import type { RouteState } from "./types";

export function App() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.pathname));
  const [globalQuery, setGlobalQuery] = useState("");
  const { sessions, loading, error } = useSessions();
  const sessionDetails = useSessionDetails(sessions);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (route.name === "detail") {
    return (
      <DetailPage
        globalQuery={globalQuery}
        onGlobalQueryChange={setGlobalQuery}
        sessionId={route.sessionId}
      />
    );
  }

  return (
    <ListPage
      details={sessionDetails}
      error={error}
      loading={loading}
      onQueryChange={setGlobalQuery}
      query={globalQuery}
      sessions={sessions}
    />
  );
}
