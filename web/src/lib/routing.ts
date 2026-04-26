import type { RouteState } from "../types";

export function parseRoute(pathname: string): RouteState {
  if (pathname.startsWith("/sessions/")) {
    return {
      name: "detail",
      sessionId: decodeSessionRouteId(pathname.slice("/sessions/".length)),
    };
  }

  return { name: "list" };
}

export function encodeSessionRouteId(value: string | null): string {
  return value ? encodeURIComponent(value) : "~missing";
}

export function decodeSessionRouteId(value: string): string | null {
  return value === "~missing" ? null : decodeURIComponent(value);
}

export function navigate(pathname: string): void {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function sessionKey(sessionId: string | null): string {
  return encodeSessionRouteId(sessionId);
}
