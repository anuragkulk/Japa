import { useCallback, useSyncExternalStore } from "react";

// Minimal hash router: gives correct browser back/forward and deep links on
// static hosting without a server rewrite.
function currentHash(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h === "" ? "/" : h;
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, currentHash, () => "/");
}

export function navigate(path: string, replace = false): void {
  const target = "#" + (path.startsWith("/") ? path : "/" + path);
  if (replace) {
    const url = window.location.href.split("#")[0] + target;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (currentHash() !== path) {
    window.location.hash = target;
  }
}

export function back(): void {
  if (window.history.length > 1) window.history.back();
  else navigate("/home", true);
}

export function useNavigate() {
  return useCallback((path: string, replace?: boolean) => navigate(path, replace), []);
}

export type Route =
  | { name: "login" }
  | { name: "signup" }
  | { name: "home" }
  | { name: "japa" }
  | { name: "japa-add" }
  | { name: "japa-edit"; id: string }
  | { name: "people" }
  | { name: "person-add" }
  | { name: "person-edit"; id: string }
  | { name: "milestone" }
  | { name: "milestone-add" }
  | { name: "milestone-edit"; id: string }
  | { name: "devotionals" }
  | { name: "devotional-add" }
  | { name: "devotional-add-image" }
  | { name: "devotional-add-text" }
  | { name: "devotional-edit-text"; id: string }
  | { name: "devotional-view"; id: string }
  | { name: "notfound" };

export function parseRoute(path: string): Route {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  const [a, b] = parts;
  switch (a) {
    case "login":
      return { name: "login" };
    case "signup":
      return { name: "signup" };
    case "home":
      return { name: "home" };
    case "japa":
      if (!b) return { name: "japa" };
      if (b === "add") return { name: "japa-add" };
      if (b === "edit" && parts[2]) return { name: "japa-edit", id: parts[2] };
      return { name: "japa" };
    case "people":
      if (!b) return { name: "people" };
      if (b === "add") return { name: "person-add" };
      if (b === "edit" && parts[2]) return { name: "person-edit", id: parts[2] };
      return { name: "people" };
    case "milestone":
      if (!b) return { name: "milestone" };
      if (b === "add") return { name: "milestone-add" };
      if (b === "edit" && parts[2]) return { name: "milestone-edit", id: parts[2] };
      return { name: "milestone" };
    case "devotionals":
      if (!b) return { name: "devotionals" };
      if (b === "add") {
        if (parts[2] === "image") return { name: "devotional-add-image" };
        if (parts[2] === "text") return { name: "devotional-add-text" };
        return { name: "devotional-add" };
      }
      if (b === "edit-text" && parts[2]) return { name: "devotional-edit-text", id: parts[2] };
      return { name: "devotionals" };
    case "devotional":
      if (b) return { name: "devotional-view", id: b };
      return { name: "devotionals" };
    default:
      return { name: "notfound" };
  }
}

// Tabs that show the bottom navigation and their canonical paths.
export const TAB_PATHS = {
  home: "/home",
  japa: "/japa",
  milestone: "/milestone",
  devotionals: "/devotionals",
} as const;
