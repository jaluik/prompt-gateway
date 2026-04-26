import { Map as MapIcon, Route, Search } from "lucide-react";

import { navigate } from "../lib/routing";

export function AppTopbar({
  query,
  onQueryChange,
  routeLabel,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  routeLabel: string;
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate("/")} type="button">
        <span className="brand-mark">
          <Route aria-hidden="true" />
        </span>
        <span>
          <span className="brand-title">prompt-gateway</span>
          <span className="brand-subtitle">Claude Code request lens</span>
        </span>
      </button>

      <label className="top-search">
        <Search aria-hidden="true" />
        <input
          aria-label="全局搜索"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索 sessionId、requestId、用户输入、工具名"
          type="search"
          value={query}
        />
      </label>

      <div className="route-pill" title="当前页面路径">
        <MapIcon aria-hidden="true" />
        <span>{routeLabel}</span>
      </div>
    </header>
  );
}
