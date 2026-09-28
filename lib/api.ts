// Browser client for the same-origin Japa Function. Carries the app session in
// the x-japa-session header (the platform adapter strips authorization/cookie).

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status = 0) {
    super(message);
    this.name = "ApiError";
  }
}

const SESSION_KEY = "japa.session";
const ENDPOINT = "/functions/v1/app";

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

const MESSAGES: Record<string, string> = {
  login_required: "Your session ended. Please sign in again.",
  invalid_credentials: "Incorrect email or password.",
  email_taken: "An account with this email already exists.",
  weak_password: "Password must be at least 6 characters.",
  invalid_input: "Please check the highlighted fields and try again.",
  duplicate_day: "That person already has an entry on this date. Edit that entry instead.",
  not_found: "That item no longer exists.",
  access_denied: "You do not have access to that item.",
  upload_failed: "The image could not be uploaded. Please try again.",
  unsupported_image: "Only image files can be uploaded.",
  too_large: "That image is too large (limit 10 MB).",
  network_error: "Could not reach the server. Check your connection and try again.",
  service_unavailable: "The service is temporarily unavailable. Please try again.",
};

export function messageFor(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}

type CallOptions = {
  action: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number>;
  signal?: AbortSignal;
};

export async function call<T>(opts: CallOptions): Promise<T> {
  const { action, method = "GET", body, query, signal } = opts;
  const url = new URL(ENDPOINT, window.location.origin);
  url.searchParams.set("action", action);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }
  const headers = new Headers({ Accept: "application/json" });
  const token = getSessionToken();
  if (token) headers.set("x-japa-session", token);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      credentials: "same-origin",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(MESSAGES.network_error, "network_error");
  }

  if (response.status === 401) throw new ApiError(MESSAGES.login_required, "login_required", 401);

  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(MESSAGES.service_unavailable, "invalid_response", response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(MESSAGES.service_unavailable, "invalid_response", response.status);
  }

  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (!response.ok || obj.ok === false) {
    const code = typeof obj.error === "string" ? obj.error : "request_failed";
    throw new ApiError(messageFor(code), code, response.status);
  }
  return data as T;
}

// Uploads bytes to a storage signed URL returned by the Function.
export async function putToSignedUrl(signedUrl: string, file: Blob): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new ApiError(MESSAGES.upload_failed, "upload_failed", response.status);
}

/* ----------------------------- Domain types ----------------------------- */

export type User = { id: string; name: string; email: string };
export type Person = { id: string; name: string; photoUrl: string | null };
export type JapaRecord = {
  id: string;
  personId: string;
  personName: string;
  date: string; // YYYY-MM-DD
  japaCount: number;
  createdAt: string;
};
export type Milestone = {
  id: string;
  name: string;
  targetCount: number;
  currentCount: number; // derived from the owner's real japa records
  remaining: number;
};
export type Devotional = {
  id: string;
  title: string;
  createdAt: string;
  imageCount: number;
  coverUrl: string | null;
  kind: "image" | "text";
  language: string; // "en" | "hi" | "kn" | "ta"; "" for image devotionals
  preview: string; // text snippet for cards; "" for image devotionals
  body?: string; // full text, only present on the single-devotional read
};
export type DevotionalImage = { id: string; pageOrder: number; url: string };
export type UploadIntent = { signedUrl: string; objectPath: string };

/* --------------------------------- Auth --------------------------------- */

export async function apiSignup(name: string, email: string, password: string) {
  return call<{ token: string; user: User }>({
    action: "signup",
    method: "POST",
    body: { name, email, password },
  });
}
export async function apiLogin(email: string, password: string) {
  return call<{ token: string; user: User }>({
    action: "login",
    method: "POST",
    body: { email, password },
  });
}
export async function apiLogout() {
  return call<{ ok: true }>({ action: "logout", method: "POST" });
}
export async function apiMe(signal?: AbortSignal) {
  return call<{ user: User }>({ action: "me", signal });
}

/* -------------------------------- People -------------------------------- */

export async function apiListPeople(signal?: AbortSignal) {
  const r = await call<{ items: Person[] }>({ action: "people", signal });
  return r.items;
}
export async function apiCreatePerson(name: string) {
  return call<{ person: Person }>({ action: "people", method: "POST", body: { name } });
}
export async function apiUpdatePerson(id: string, name: string) {
  return call<{ person: Person }>({ action: "people", method: "PATCH", body: { id, name } });
}
export async function apiDeletePerson(id: string) {
  return call<{ ok: true }>({ action: "people", method: "DELETE", query: { id } });
}
export async function apiPersonPhotoIntent(personId: string, contentType: string, size: number) {
  return call<{ intent: UploadIntent }>({
    action: "person_photo_intent",
    method: "POST",
    body: { personId, contentType, size },
  });
}
export async function apiPersonPhotoConfirm(personId: string, objectPath: string, size: number, contentType: string) {
  return call<{ person: Person }>({
    action: "person_photo_confirm",
    method: "POST",
    body: { personId, objectPath, size, contentType },
  });
}

/* --------------------------------- Japa --------------------------------- */

export async function apiListJapa(signal?: AbortSignal) {
  const r = await call<{ items: JapaRecord[] }>({ action: "japa", signal });
  return r.items;
}
export async function apiCreateJapa(personId: string, date: string, japaCount: number) {
  return call<{ record: JapaRecord }>({
    action: "japa",
    method: "POST",
    body: { personId, date, japaCount },
  });
}
export async function apiUpdateJapa(id: string, personId: string, date: string, japaCount: number) {
  return call<{ record: JapaRecord }>({
    action: "japa",
    method: "PATCH",
    body: { id, personId, date, japaCount },
  });
}
export async function apiDeleteJapa(id: string) {
  return call<{ ok: true }>({ action: "japa", method: "DELETE", query: { id } });
}

/* ------------------------------- Milestones ------------------------------ */

export async function apiListMilestones(signal?: AbortSignal) {
  return call<{ items: Milestone[]; totalJapa: number }>({ action: "milestones", signal });
}
export async function apiCreateMilestone(name: string, targetCount: number) {
  return call<{ milestone: Milestone }>({
    action: "milestones",
    method: "POST",
    body: { name, targetCount },
  });
}
export async function apiUpdateMilestone(id: string, name: string, targetCount: number) {
  return call<{ milestone: Milestone }>({
    action: "milestones",
    method: "PATCH",
    body: { id, name, targetCount },
  });
}
export async function apiDeleteMilestone(id: string) {
  return call<{ ok: true }>({ action: "milestones", method: "DELETE", query: { id } });
}

/* ----------------------------- Devotionals ----------------------------- */

export async function apiListDevotionals(signal?: AbortSignal) {
  const r = await call<{ items: Devotional[] }>({ action: "devotionals", signal });
  return r.items;
}
export async function apiGetDevotional(id: string, signal?: AbortSignal) {
  return call<{ devotional: Devotional; images: DevotionalImage[] }>({
    action: "devotional",
    query: { id },
    signal,
  });
}
export async function apiCreateDevotional(title: string) {
  return call<{ devotional: Devotional }>({
    action: "devotionals",
    method: "POST",
    body: { title },
  });
}
export async function apiCreateTextDevotional(title: string, body: string) {
  return call<{ devotional: Devotional }>({
    action: "devotionals",
    method: "POST",
    body: { title, kind: "text", body },
  });
}
export async function apiUpdateDevotional(id: string, title: string) {
  return call<{ devotional: Devotional }>({
    action: "devotionals",
    method: "PATCH",
    body: { id, title },
  });
}
export async function apiUpdateTextDevotional(id: string, title: string, body: string) {
  return call<{ devotional: Devotional }>({
    action: "devotionals",
    method: "PATCH",
    body: { id, title, body },
  });
}
export async function apiDeleteDevotional(id: string) {
  return call<{ ok: true }>({ action: "devotionals", method: "DELETE", query: { id } });
}
export async function apiImageIntent(devotionalId: string, contentType: string, size: number) {
  return call<{ intent: UploadIntent }>({
    action: "image_intent",
    method: "POST",
    body: { devotionalId, contentType, size },
  });
}
export async function apiImageConfirm(devotionalId: string, objectPath: string, size: number, contentType: string) {
  return call<{ image: DevotionalImage }>({
    action: "image_confirm",
    method: "POST",
    body: { devotionalId, objectPath, size, contentType },
  });
}
export async function apiDeleteImage(id: string) {
  return call<{ ok: true }>({ action: "image", method: "DELETE", query: { id } });
}
export async function apiReorderImages(devotionalId: string, order: string[]) {
  return call<{ ok: true }>({
    action: "images_reorder",
    method: "PATCH",
    body: { devotionalId, order },
  });
}
