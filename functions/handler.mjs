// Japa application Function. Single anonymous-runtime entry; per-user isolation
// is enforced here: every query is scoped by the owner_id derived from a
// validated session token. Browser-supplied owner/user ids are never trusted.

import { verifyUploadedObject } from "./storage-validation.mjs";
import {
  hashPassword,
  safeEqual,
  randomHex,
  sha256Hex,
  SESSION_TTL_MS,
} from "./auth.mjs";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 1_000_000;
const SIGNED_URL_SECONDS = 3600;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (status, code) => json({ error: code }, status);

/* ------------------------------- validators ------------------------------ */

function str(value, min, max) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length < min || t.length > max) return null;
  return t;
}

function normalizeEmail(value) {
  const email = str(value, 3, 320);
  if (!email) return null;
  const lower = email.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : null;
}

function positiveInt(value, max = 10_000_000) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(value + "T00:00:00")) ? null : value;
}

function extFor(contentType) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
    "image/bmp": "bmp",
  };
  return map[String(contentType).toLowerCase()] ?? "img";
}

function isUniqueViolation(error) {
  return error && (error.code === "23505" || /duplicate key/i.test(String(error.message)));
}

async function readJson(request) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw new HttpError(400, "invalid_input");
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared && declared > MAX_BODY_BYTES) throw new HttpError(400, "too_large");
  let text;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, "invalid_input");
  }
  if (text.length > MAX_BODY_BYTES) throw new HttpError(400, "too_large");
  if (!text) return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_input");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "invalid_input");
  }
  return parsed;
}

/* --------------------------------- session -------------------------------- */

async function requireSession(supabase, request) {
  const token = request.headers.get("x-japa-session");
  if (!token || typeof token !== "string" || token.length > 128) {
    throw new HttpError(401, "login_required");
  }
  const { data, error } = await supabase
    .from("sessions")
    .select("user_id,expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new HttpError(503, "service_unavailable");
  if (!data) throw new HttpError(401, "login_required");
  if (Date.parse(data.expires_at) < Date.now()) {
    await supabase.from("sessions").delete().eq("token", token);
    throw new HttpError(401, "login_required");
  }
  const { data: user, error: uErr } = await supabase
    .from("users")
    .select("id,name,email")
    .eq("id", data.user_id)
    .maybeSingle();
  if (uErr) throw new HttpError(503, "service_unavailable");
  if (!user) throw new HttpError(401, "login_required");
  return { token, userId: user.id, user };
}

async function createSession(supabase, userId) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error } = await supabase
    .from("sessions")
    .insert({ token, user_id: userId, expires_at: expires, created_at: new Date().toISOString() });
  if (error) throw new HttpError(503, "service_unavailable");
  return token;
}

/* --------------------------------- storage -------------------------------- */

async function signOrNull(storage, path) {
  if (!path) return null;
  try {
    const { signedUrl } = await storage.createSignedUrl(path, SIGNED_URL_SECONDS);
    return signedUrl ?? null;
  } catch {
    return null;
  }
}

async function verifyImage(storage, objectPath, size, contentType) {
  if (!ALLOWED_IMAGE_TYPES.includes(String(contentType).toLowerCase())) {
    throw new HttpError(400, "unsupported_image");
  }
  const bytes = positiveInt(size, MAX_IMAGE_BYTES);
  if (bytes === null) throw new HttpError(400, "too_large");
  let response;
  try {
    response = await storage.download(objectPath);
  } catch {
    throw new HttpError(502, "upload_failed");
  }
  try {
    await verifyUploadedObject(response, {
      maxBytes: MAX_IMAGE_BYTES,
      expectedBytes: bytes,
      allowedContentTypes: [String(contentType).toLowerCase()],
    });
  } catch (e) {
    const code = e && e.message === "upload_too_large" ? "too_large" : "upload_failed";
    throw new HttpError(code === "too_large" ? 400 : 502, code);
  }
}

/* -------------------------------- handlers -------------------------------- */

async function handleSignup(supabase, request) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  const name = str(body.name, 1, 80);
  const email = normalizeEmail(body.email);
  if (!name || !email) throw new HttpError(400, "invalid_input");
  if (typeof body.password !== "string" || body.password.length < 6 || body.password.length > 200) {
    throw new HttpError(400, "weak_password");
  }
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) throw new HttpError(409, "email_taken");

  const id = crypto.randomUUID();
  const salt = randomHex(16);
  const passwordHash = await hashPassword(body.password, salt);
  const { error } = await supabase.from("users").insert({
    id,
    name,
    email,
    password_hash: passwordHash,
    salt,
    created_at: new Date().toISOString(),
  });
  if (error) throw new HttpError(isUniqueViolation(error) ? 409 : 503, isUniqueViolation(error) ? "email_taken" : "service_unavailable");

  await ensureDefaultPerson(supabase, id);
  const token = await createSession(supabase, id);
  return json({ token, user: { id, name, email } });
}

async function handleLogin(supabase, request) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email || typeof body.password !== "string") throw new HttpError(400, "invalid_input");
  const { data: user, error } = await supabase
    .from("users")
    .select("id,name,email,password_hash,salt")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new HttpError(503, "service_unavailable");
  if (!user) throw new HttpError(400, "invalid_credentials");
  const hash = await hashPassword(body.password, user.salt);
  if (!safeEqual(hash, user.password_hash)) throw new HttpError(400, "invalid_credentials");
  const token = await createSession(supabase, user.id);
  return json({ token, user: { id: user.id, name: user.name, email: user.email } });
}

async function handleLogout(supabase, request) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const { token } = await requireSession(supabase, request);
  await supabase.from("sessions").delete().eq("token", token);
  return json({ ok: true });
}

/* ------------------------------ deletion -------------------------------- */

// Both deletion actions re-check the account email and the current password, so
// a leaked session token cannot erase an account on its own.
async function verifyOwnership(supabase, userId, body) {
  const email = normalizeEmail(body.email);
  if (!email || typeof body.password !== "string") throw new HttpError(400, "invalid_input");
  if (body.confirm !== true) throw new HttpError(400, "confirmation_required");
  const { data: user, error } = await supabase
    .from("users")
    .select("id,email,password_hash,salt")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new HttpError(503, "service_unavailable");
  if (!user) throw new HttpError(401, "login_required");
  if (user.email !== email) throw new HttpError(403, "email_mismatch");
  const hash = await hashPassword(body.password, user.salt);
  if (!safeEqual(hash, user.password_hash)) throw new HttpError(400, "invalid_credentials");
}

async function removeFiles(storage, paths, failed) {
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    try {
      await storage.remove(chunk);
    } catch {
      failed.push(...chunk);
    }
  }
}

// Removes every row and stored file owned by userId. Counts are read first and
// each step records its own error, so the response can state what actually
// happened instead of assuming the deletes succeeded.
async function removeOwnedData(supabase, storage, userId) {
  const deleted = { people: 0, japaRecords: 0, milestones: 0, devotionals: 0, images: 0, texts: 0 };
  const failedTables = [];
  const failedFiles = [];

  const { data: personRows, error: personErr } = await supabase
    .from("people")
    .select("id,photo_path")
    .eq("owner_id", userId);
  if (personErr) failedTables.push("people");
  else {
    deleted.people = (personRows ?? []).length;
    await removeFiles(storage, (personRows ?? []).map((r) => r.photo_path).filter(Boolean), failedFiles);
  }

  const { data: recordRows, error: recordErr } = await supabase
    .from("japa_records")
    .select("id")
    .eq("owner_id", userId);
  if (recordErr) failedTables.push("japa_records");
  else deleted.japaRecords = (recordRows ?? []).length;

  const { data: imageRows, error: imageErr } = await supabase
    .from("devotional_images")
    .select("id,image_path")
    .eq("owner_id", userId);
  if (imageErr) failedTables.push("devotional_images");
  else {
    deleted.images = (imageRows ?? []).length;
    await removeFiles(storage, (imageRows ?? []).map((r) => r.image_path).filter(Boolean), failedFiles);
  }

  const { data: textRows, error: textErr } = await supabase
    .from("devotional_texts")
    .select("id")
    .eq("owner_id", userId);
  if (textErr) failedTables.push("devotional_texts");
  else deleted.texts = (textRows ?? []).length;

  const { data: devotionalRows, error: devotionalErr } = await supabase
    .from("devotionals")
    .select("id")
    .eq("owner_id", userId);
  if (devotionalErr) failedTables.push("devotionals");
  else deleted.devotionals = (devotionalRows ?? []).length;

  const { data: milestoneRows, error: milestoneErr } = await supabase
    .from("milestones")
    .select("id")
    .eq("owner_id", userId);
  if (milestoneErr) failedTables.push("milestones");
  else deleted.milestones = (milestoneRows ?? []).length;

  const order = ["japa_records", "milestones", "devotional_images", "devotional_texts", "devotionals", "people"];
  for (const table of order) {
    if (failedTables.includes(table)) continue;
    const { error } = await supabase.from(table).delete().eq("owner_id", userId);
    if (error) failedTables.push(table);
  }

  return { deleted, failedTables, failedFiles: failedFiles.length };
}

function deletionStatus({ failedTables, failedFiles }) {
  if (failedTables.length > 0) return "failed";
  return failedFiles > 0 ? "pending_files" : "deleted";
}

async function handleDeleteData(supabase, storage, request, userId) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  await verifyOwnership(supabase, userId, body);
  const result = await removeOwnedData(supabase, storage, userId);
  return json({ status: deletionStatus(result), account: "retained", ...result });
}

async function handleDeleteAccount(supabase, storage, request, userId) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  await verifyOwnership(supabase, userId, body);
  const result = await removeOwnedData(supabase, storage, userId);

  // Credentials go last, and only once the owned data is clear: a partial run
  // leaves the account signable-in so the user can retry the deletion rather
  // than being locked out of data they asked to remove.
  let account = "retained";
  if (result.failedTables.length === 0) {
    const { error: sErr } = await supabase.from("sessions").delete().eq("user_id", userId);
    if (sErr) result.failedTables.push("sessions");
    else {
      const { error: uErr } = await supabase.from("users").delete().eq("id", userId);
      if (uErr) result.failedTables.push("users");
      else account = "deleted";
    }
  }
  return json({ status: deletionStatus(result), account, ...result });
}

async function handleMe(supabase, request) {
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed");
  const { userId, user } = await requireSession(supabase, request);
  await ensureDefaultPerson(supabase, userId);
  return json({ user });
}

/* --------------------------------- people --------------------------------- */

async function personOut(storage, row) {
  return {
    id: row.id,
    name: row.name,
    photoUrl: await signOrNull(storage, row.photo_path),
  };
}

// Idempotently guarantees exactly one owner-scoped "You" person per account, for
// both new and pre-existing users. Matches on a case-insensitive trimmed name so
// a manually created "you" is not duplicated. Never touches other people.
const DEFAULT_PERSON_NAME = "You";
async function ensureDefaultPerson(supabase, userId) {
  const { data } = await supabase
    .from("people")
    .select("id,name")
    .eq("owner_id", userId);
  if (data && data.some((p) => String(p.name).trim().toLowerCase() === "you")) return;
  await supabase.from("people").insert({
    id: crypto.randomUUID(),
    owner_id: userId,
    name: DEFAULT_PERSON_NAME,
    created_at: new Date().toISOString(),
  });
}

async function handlePeople(supabase, storage, request, userId) {
  if (request.method === "GET") {
    await ensureDefaultPerson(supabase, userId);
    const { data, error } = await supabase
      .from("people")
      .select("id,name,photo_path")
      .eq("owner_id", userId)
      .order("name", { ascending: true });
    if (error) throw new HttpError(503, "service_unavailable");
    const items = [];
    for (const row of data ?? []) items.push(await personOut(storage, row));
    // Show "You" first, then the rest alphabetically.
    items.sort((a, b) => {
      const ay = a.name.trim().toLowerCase() === "you" ? 0 : 1;
      const by = b.name.trim().toLowerCase() === "you" ? 0 : 1;
      return ay - by || a.name.localeCompare(b.name);
    });
    return json({ items });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const name = str(body.name, 1, 80);
    if (!name) throw new HttpError(400, "invalid_input");
    const id = crypto.randomUUID();
    const { error } = await supabase.from("people").insert({
      id,
      owner_id: userId,
      name,
      created_at: new Date().toISOString(),
    });
    if (error) throw new HttpError(503, "service_unavailable");
    return json({ person: { id, name, photoUrl: null } });
  }

  if (request.method === "PATCH") {
    const body = await readJson(request);
    const id = str(body.id, 1, 64);
    const name = str(body.name, 1, 80);
    if (!id || !name) throw new HttpError(400, "invalid_input");
    const { data, error } = await supabase
      .from("people")
      .update({ name })
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id,name,photo_path")
      .maybeSingle();
    if (error) throw new HttpError(503, "service_unavailable");
    if (!data) throw new HttpError(404, "not_found");
    return json({ person: await personOut(storage, data) });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = str(url.searchParams.get("id"), 1, 64);
    if (!id) throw new HttpError(400, "invalid_input");
    const { data: person } = await supabase
      .from("people")
      .select("id,photo_path")
      .eq("id", id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!person) throw new HttpError(404, "not_found");
    await supabase.from("japa_records").delete().eq("person_id", id).eq("owner_id", userId);
    const { error } = await supabase.from("people").delete().eq("id", id).eq("owner_id", userId);
    if (error) throw new HttpError(503, "service_unavailable");
    if (person.photo_path) {
      try {
        await storage.remove([person.photo_path]);
      } catch {
        /* best-effort cleanup */
      }
    }
    return json({ ok: true });
  }

  throw new HttpError(405, "method_not_allowed");
}

async function handlePersonPhotoIntent(supabase, storage, request, userId) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  const personId = str(body.personId, 1, 64);
  if (!personId) throw new HttpError(400, "invalid_input");
  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!person) throw new HttpError(404, "not_found");
  if (!ALLOWED_IMAGE_TYPES.includes(String(body.contentType).toLowerCase())) {
    throw new HttpError(400, "unsupported_image");
  }
  if (positiveInt(body.size, MAX_IMAGE_BYTES) === null) throw new HttpError(400, "too_large");

  const ownerHash = await sha256Hex(userId);
  const objectPath = `people/${ownerHash}/${crypto.randomUUID()}.${extFor(body.contentType)}`;
  let signedUrl;
  try {
    ({ signedUrl } = await storage.createSignedUploadUrl(objectPath, { upsert: false }));
  } catch {
    throw new HttpError(502, "upload_failed");
  }
  return json({ intent: { signedUrl, objectPath } });
}

async function handlePersonPhotoConfirm(supabase, storage, request, userId) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  const personId = str(body.personId, 1, 64);
  const objectPath = str(body.objectPath, 1, 512);
  if (!personId || !objectPath) throw new HttpError(400, "invalid_input");

  const { data: person } = await supabase
    .from("people")
    .select("id,photo_path")
    .eq("id", personId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!person) throw new HttpError(404, "not_found");

  const ownerHash = await sha256Hex(userId);
  const prefix = `people/${ownerHash}/`;
  if (!objectPath.startsWith(prefix) || objectPath.includes("..")) {
    throw new HttpError(403, "access_denied");
  }
  await verifyImage(storage, objectPath, body.size, body.contentType);

  const { data: updated, error } = await supabase
    .from("people")
    .update({ photo_path: objectPath })
    .eq("id", personId)
    .eq("owner_id", userId)
    .select("id,name,photo_path")
    .maybeSingle();
  if (error) throw new HttpError(503, "service_unavailable");
  if (!updated) throw new HttpError(404, "not_found");

  if (person.photo_path && person.photo_path !== objectPath) {
    try {
      await storage.remove([person.photo_path]);
    } catch {
      /* best-effort */
    }
  }
  return json({ person: await personOut(storage, updated) });
}

/* ---------------------------------- japa ---------------------------------- */

function recordOut(row, nameById) {
  return {
    id: row.id,
    personId: row.person_id,
    personName: nameById.get(row.person_id) ?? "Unknown",
    date: row.date,
    japaCount: row.japa_count,
    createdAt: row.created_at,
  };
}

async function loadPeopleMap(supabase, userId) {
  const { data } = await supabase
    .from("people")
    .select("id,name")
    .eq("owner_id", userId);
  const map = new Map();
  for (const p of data ?? []) map.set(p.id, p.name);
  return map;
}

async function assertPersonOwned(supabase, userId, personId) {
  const { data } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!data) throw new HttpError(404, "not_found");
}

async function handleJapa(supabase, request, userId) {
  if (request.method === "GET") {
    const { data, error } = await supabase
      .from("japa_records")
      .select("id,person_id,date,japa_count,created_at")
      .eq("owner_id", userId)
      .order("date", { ascending: false });
    if (error) throw new HttpError(503, "service_unavailable");
    const nameById = await loadPeopleMap(supabase, userId);
    return json({ items: (data ?? []).map((r) => recordOut(r, nameById)) });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const personId = str(body.personId, 1, 64);
    const date = validDate(body.date);
    const count = positiveInt(body.japaCount);
    if (!personId || !date || count === null) throw new HttpError(400, "invalid_input");
    await assertPersonOwned(supabase, userId, personId);

    const { data: existing } = await supabase
      .from("japa_records")
      .select("id,japa_count")
      .eq("owner_id", userId)
      .eq("person_id", personId)
      .eq("date", date)
      .maybeSingle();

    if (existing) {
      const total = existing.japa_count + count;
      const { data, error } = await supabase
        .from("japa_records")
        .update({ japa_count: total })
        .eq("id", existing.id)
        .eq("owner_id", userId)
        .select("id,person_id,date,japa_count,created_at")
        .maybeSingle();
      if (error || !data) throw new HttpError(503, "service_unavailable");
      const nameById = await loadPeopleMap(supabase, userId);
      return json({ record: recordOut(data, nameById) });
    }

    const id = crypto.randomUUID();
    const { error } = await supabase.from("japa_records").insert({
      id,
      owner_id: userId,
      person_id: personId,
      date,
      japa_count: count,
      created_at: new Date().toISOString(),
    });
    if (error) {
      if (isUniqueViolation(error)) {
        // A concurrent add created the row; fold into it rather than duplicating.
        const { data: again } = await supabase
          .from("japa_records")
          .select("id,japa_count")
          .eq("owner_id", userId)
          .eq("person_id", personId)
          .eq("date", date)
          .maybeSingle();
        if (again) {
          const { data } = await supabase
            .from("japa_records")
            .update({ japa_count: again.japa_count + count })
            .eq("id", again.id)
            .eq("owner_id", userId)
            .select("id,person_id,date,japa_count,created_at")
            .maybeSingle();
          if (data) {
            const nameById = await loadPeopleMap(supabase, userId);
            return json({ record: recordOut(data, nameById) });
          }
        }
      }
      throw new HttpError(503, "service_unavailable");
    }
    const nameById = await loadPeopleMap(supabase, userId);
    return json({
      record: recordOut(
        { id, person_id: personId, date, japa_count: count, created_at: new Date().toISOString() },
        nameById,
      ),
    });
  }

  if (request.method === "PATCH") {
    const body = await readJson(request);
    const id = str(body.id, 1, 64);
    const personId = str(body.personId, 1, 64);
    const date = validDate(body.date);
    const count = positiveInt(body.japaCount);
    if (!id || !personId || !date || count === null) throw new HttpError(400, "invalid_input");
    await assertPersonOwned(supabase, userId, personId);

    const { data: current } = await supabase
      .from("japa_records")
      .select("id")
      .eq("id", id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!current) throw new HttpError(404, "not_found");

    const { data: clash } = await supabase
      .from("japa_records")
      .select("id")
      .eq("owner_id", userId)
      .eq("person_id", personId)
      .eq("date", date)
      .neq("id", id)
      .maybeSingle();
    if (clash) throw new HttpError(409, "duplicate_day");

    const { data, error } = await supabase
      .from("japa_records")
      .update({ person_id: personId, date, japa_count: count })
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id,person_id,date,japa_count,created_at")
      .maybeSingle();
    if (error) throw new HttpError(503, "service_unavailable");
    if (!data) throw new HttpError(404, "not_found");
    const nameById = await loadPeopleMap(supabase, userId);
    return json({ record: recordOut(data, nameById) });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = str(url.searchParams.get("id"), 1, 64);
    if (!id) throw new HttpError(400, "invalid_input");
    const { data, error } = await supabase
      .from("japa_records")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new HttpError(503, "service_unavailable");
    if (!data) throw new HttpError(404, "not_found");
    return json({ ok: true });
  }

  throw new HttpError(405, "method_not_allowed");
}

/* -------------------------------- milestones ------------------------------ */

// Progress is always derived from the owner's real japa_records; there is no
// separate milestone counter. Target uses bigint so crore-scale goals fit.
const MAX_TARGET = 1_000_000_000_000_000;

async function totalJapaForOwner(supabase, userId) {
  const { data, error } = await supabase
    .from("japa_records")
    .select("japa_count")
    .eq("owner_id", userId);
  if (error) throw new HttpError(503, "service_unavailable");
  let sum = 0;
  for (const r of data ?? []) sum += Number(r.japa_count) || 0;
  return sum;
}

function milestoneOut(row, current) {
  const target = Number(row.target_count);
  return {
    id: row.id,
    name: row.name ?? "",
    targetCount: target,
    currentCount: current,
    remaining: Math.max(0, target - current),
  };
}

async function handleMilestones(supabase, request, userId) {
  if (request.method === "GET") {
    const { data, error } = await supabase
      .from("milestones")
      .select("id,name,target_count,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new HttpError(503, "service_unavailable");
    const current = await totalJapaForOwner(supabase, userId);
    return json({
      items: (data ?? []).map((r) => milestoneOut(r, current)),
      totalJapa: current,
    });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const name = body.name == null ? "" : str(body.name, 0, 80) ?? "";
    const target = positiveInt(body.targetCount, MAX_TARGET);
    if (target === null) throw new HttpError(400, "invalid_input");
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { error } = await supabase.from("milestones").insert({
      id,
      owner_id: userId,
      name,
      target_count: target,
      created_at: createdAt,
    });
    if (error) throw new HttpError(503, "service_unavailable");
    const current = await totalJapaForOwner(supabase, userId);
    return json({
      milestone: milestoneOut({ id, name, target_count: target, created_at: createdAt }, current),
    });
  }

  if (request.method === "PATCH") {
    const body = await readJson(request);
    const id = str(body.id, 1, 64);
    if (!id) throw new HttpError(400, "invalid_input");
    const name = body.name == null ? "" : str(body.name, 0, 80) ?? "";
    const target = positiveInt(body.targetCount, MAX_TARGET);
    if (target === null) throw new HttpError(400, "invalid_input");
    const { data, error } = await supabase
      .from("milestones")
      .update({ name, target_count: target })
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id,name,target_count,created_at")
      .maybeSingle();
    if (error) throw new HttpError(503, "service_unavailable");
    if (!data) throw new HttpError(404, "not_found");
    const current = await totalJapaForOwner(supabase, userId);
    return json({ milestone: milestoneOut(data, current) });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = str(url.searchParams.get("id"), 1, 64);
    if (!id) throw new HttpError(400, "invalid_input");
    const { data, error } = await supabase
      .from("milestones")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new HttpError(503, "service_unavailable");
    if (!data) throw new HttpError(404, "not_found");
    return json({ ok: true });
  }

  throw new HttpError(405, "method_not_allowed");
}

/* ------------------------------- devotionals ------------------------------ */

// Typed (text) devotionals live beside image devotionals. The body is stored
// exactly as entered — never translated, transliterated, normalized or otherwise
// altered — so Devanagari, Kannada and Tamil Unicode render faithfully.
const DEVOTIONAL_LANGS = new Set(["en", "hi", "kn", "ta"]);
const MAX_DEVOTIONAL_BODY = 200_000;

function devotionalLang(value) {
  const c = typeof value === "string" ? value.toLowerCase() : "";
  return DEVOTIONAL_LANGS.has(c) ? c : null;
}

function devotionalBody(value) {
  if (typeof value !== "string") return null;
  if (value.length > MAX_DEVOTIONAL_BODY) return null;
  if (value.trim().length === 0) return null;
  return value; // preserved byte-for-byte
}

// Card snippet only; does not touch the stored body.
function previewOf(body) {
  const oneLine = String(body ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? oneLine.slice(0, 120).trimEnd() + "…" : oneLine;
}

async function handleDevotionals(supabase, storage, request, userId) {
  if (request.method === "GET") {
    const { data: devs, error } = await supabase
      .from("devotionals")
      .select("id,title,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new HttpError(503, "service_unavailable");
    const { data: imgs } = await supabase
      .from("devotional_images")
      .select("devotional_id,image_path,page_order")
      .eq("owner_id", userId)
      .order("page_order", { ascending: true });
    const { data: texts } = await supabase
      .from("devotional_texts")
      .select("devotional_id,language,body")
      .eq("owner_id", userId);
    const byDev = new Map();
    for (const im of imgs ?? []) {
      const entry = byDev.get(im.devotional_id) ?? { count: 0, cover: null };
      entry.count += 1;
      if (entry.cover === null) entry.cover = im.image_path;
      byDev.set(im.devotional_id, entry);
    }
    const textByDev = new Map();
    for (const t of texts ?? []) textByDev.set(t.devotional_id, t);
    const items = [];
    for (const d of devs ?? []) {
      const text = textByDev.get(d.id);
      if (text) {
        items.push({
          id: d.id,
          title: d.title ?? "",
          createdAt: d.created_at,
          kind: "text",
          imageCount: 0,
          coverUrl: null,
          language: text.language,
          preview: previewOf(text.body),
        });
      } else {
        const meta = byDev.get(d.id) ?? { count: 0, cover: null };
        items.push({
          id: d.id,
          title: d.title ?? "",
          createdAt: d.created_at,
          kind: "image",
          imageCount: meta.count,
          coverUrl: await signOrNull(storage, meta.cover),
          language: "",
          preview: "",
        });
      }
    }
    return json({ items });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const kind = body.kind === "text" ? "text" : "image";
    const title = body.title == null ? "" : str(body.title, 0, 160) ?? "";
    let language = "";
    let content = "";
    if (kind === "text") {
      // Language is no longer collected from the user; a known code is kept for
      // legacy records, anything else stores as unspecified ("").
      language = devotionalLang(body.language) ?? "";
      content = devotionalBody(body.body);
      if (content === null) throw new HttpError(400, "invalid_input");
    }
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { error } = await supabase.from("devotionals").insert({
      id,
      owner_id: userId,
      title,
      created_at: createdAt,
    });
    if (error) throw new HttpError(503, "service_unavailable");
    if (kind === "text") {
      const { error: terr } = await supabase.from("devotional_texts").insert({
        id: crypto.randomUUID(),
        owner_id: userId,
        devotional_id: id,
        language,
        body: content,
        created_at: createdAt,
      });
      if (terr) throw new HttpError(503, "service_unavailable");
    }
    return json({
      devotional: {
        id,
        title,
        createdAt,
        kind,
        imageCount: 0,
        coverUrl: null,
        language,
        preview: kind === "text" ? previewOf(content) : "",
      },
    });
  }

  if (request.method === "PATCH") {
    const body = await readJson(request);
    const id = str(body.id, 1, 64);
    if (!id) throw new HttpError(400, "invalid_input");
    const title = body.title == null ? "" : str(body.title, 0, 160) ?? "";
    const { data, error } = await supabase
      .from("devotionals")
      .update({ title })
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id,title,created_at")
      .maybeSingle();
    if (error) throw new HttpError(503, "service_unavailable");
    if (!data) throw new HttpError(404, "not_found");
    // Typed devotional edit: update the text row when language/body are supplied.
    if (body.language !== undefined || body.body !== undefined) {
      const { data: textRow } = await supabase
        .from("devotional_texts")
        .select("id,language")
        .eq("devotional_id", id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (textRow) {
        const language = devotionalLang(body.language) ?? textRow.language ?? "";
        const content = devotionalBody(body.body);
        if (content === null) throw new HttpError(400, "invalid_input");
        const { error: uerr } = await supabase
          .from("devotional_texts")
          .update({ language, body: content })
          .eq("devotional_id", id)
          .eq("owner_id", userId);
        if (uerr) throw new HttpError(503, "service_unavailable");
      }
    }
    return json({ devotional: await buildDevotional(supabase, storage, userId, data) });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = str(url.searchParams.get("id"), 1, 64);
    if (!id) throw new HttpError(400, "invalid_input");
    const { data: dev } = await supabase
      .from("devotionals")
      .select("id")
      .eq("id", id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!dev) throw new HttpError(404, "not_found");
    const { data: imgs } = await supabase
      .from("devotional_images")
      .select("image_path")
      .eq("devotional_id", id)
      .eq("owner_id", userId);
    await supabase.from("devotional_images").delete().eq("devotional_id", id).eq("owner_id", userId);
    await supabase.from("devotional_texts").delete().eq("devotional_id", id).eq("owner_id", userId);
    const { error } = await supabase
      .from("devotionals")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId);
    if (error) throw new HttpError(503, "service_unavailable");
    const paths = (imgs ?? []).map((i) => i.image_path).filter(Boolean);
    for (let i = 0; i < paths.length; i += 500) {
      try {
        await storage.remove(paths.slice(i, i + 500));
      } catch {
        /* best-effort */
      }
    }
    return json({ ok: true });
  }

  throw new HttpError(405, "method_not_allowed");
}

async function buildDevotional(supabase, storage, userId, row) {
  const { data: text } = await supabase
    .from("devotional_texts")
    .select("language,body")
    .eq("devotional_id", row.id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (text) {
    return {
      id: row.id,
      title: row.title ?? "",
      createdAt: row.created_at,
      kind: "text",
      imageCount: 0,
      coverUrl: null,
      language: text.language,
      preview: previewOf(text.body),
    };
  }
  const { data: imgs } = await supabase
    .from("devotional_images")
    .select("image_path,page_order")
    .eq("devotional_id", row.id)
    .eq("owner_id", userId)
    .order("page_order", { ascending: true });
  const list = imgs ?? [];
  return {
    id: row.id,
    title: row.title ?? "",
    createdAt: row.created_at,
    kind: "image",
    imageCount: list.length,
    coverUrl: list.length ? await signOrNull(storage, list[0].image_path) : null,
    language: "",
    preview: "",
  };
}

async function handleDevotional(supabase, storage, request, userId) {
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed");
  const url = new URL(request.url);
  const id = str(url.searchParams.get("id"), 1, 64);
  if (!id) throw new HttpError(400, "invalid_input");
  const { data: dev } = await supabase
    .from("devotionals")
    .select("id,title,created_at")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!dev) throw new HttpError(404, "not_found");
  const { data: text } = await supabase
    .from("devotional_texts")
    .select("language,body")
    .eq("devotional_id", id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (text) {
    return json({
      devotional: {
        id: dev.id,
        title: dev.title ?? "",
        createdAt: dev.created_at,
        kind: "text",
        imageCount: 0,
        coverUrl: null,
        language: text.language,
        preview: previewOf(text.body),
        body: text.body,
      },
      images: [],
    });
  }
  const { data: imgs, error } = await supabase
    .from("devotional_images")
    .select("id,image_path,page_order")
    .eq("devotional_id", id)
    .eq("owner_id", userId)
    .order("page_order", { ascending: true });
  if (error) throw new HttpError(503, "service_unavailable");
  const images = [];
  for (const im of imgs ?? []) {
    images.push({ id: im.id, pageOrder: im.page_order, url: await signOrNull(storage, im.image_path) });
  }
  return json({
    devotional: {
      id: dev.id,
      title: dev.title ?? "",
      createdAt: dev.created_at,
      kind: "image",
      imageCount: images.length,
      coverUrl: images.length ? images[0].url : null,
      language: "",
      preview: "",
    },
    images: images.filter((i) => i.url),
  });
}

async function handleImageIntent(supabase, storage, request, userId) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  const devotionalId = str(body.devotionalId, 1, 64);
  if (!devotionalId) throw new HttpError(400, "invalid_input");
  const { data: dev } = await supabase
    .from("devotionals")
    .select("id")
    .eq("id", devotionalId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!dev) throw new HttpError(404, "not_found");
  if (!ALLOWED_IMAGE_TYPES.includes(String(body.contentType).toLowerCase())) {
    throw new HttpError(400, "unsupported_image");
  }
  if (positiveInt(body.size, MAX_IMAGE_BYTES) === null) throw new HttpError(400, "too_large");

  const ownerHash = await sha256Hex(userId);
  const objectPath = `devotionals/${ownerHash}/${devotionalId}/${crypto.randomUUID()}.${extFor(body.contentType)}`;
  let signedUrl;
  try {
    ({ signedUrl } = await storage.createSignedUploadUrl(objectPath, { upsert: false }));
  } catch {
    throw new HttpError(502, "upload_failed");
  }
  return json({ intent: { signedUrl, objectPath } });
}

async function handleImageConfirm(supabase, storage, request, userId) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  const devotionalId = str(body.devotionalId, 1, 64);
  const objectPath = str(body.objectPath, 1, 512);
  if (!devotionalId || !objectPath) throw new HttpError(400, "invalid_input");
  const { data: dev } = await supabase
    .from("devotionals")
    .select("id")
    .eq("id", devotionalId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!dev) throw new HttpError(404, "not_found");

  const ownerHash = await sha256Hex(userId);
  const prefix = `devotionals/${ownerHash}/${devotionalId}/`;
  if (!objectPath.startsWith(prefix) || objectPath.includes("..")) {
    throw new HttpError(403, "access_denied");
  }
  await verifyImage(storage, objectPath, body.size, body.contentType);

  const { count } = await supabase
    .from("devotional_images")
    .select("id", { count: "exact", head: false })
    .eq("devotional_id", devotionalId)
    .eq("owner_id", userId)
    .limit(1);
  const pageOrder = Number.isSafeInteger(count) ? count : 0;

  const id = crypto.randomUUID();
  const { error } = await supabase.from("devotional_images").insert({
    id,
    owner_id: userId,
    devotional_id: devotionalId,
    image_path: objectPath,
    page_order: pageOrder,
    created_at: new Date().toISOString(),
  });
  if (error) throw new HttpError(503, "service_unavailable");
  const url = await signOrNull(storage, objectPath);
  return json({ image: { id, pageOrder, url } });
}

async function handleImageDelete(supabase, storage, request, userId) {
  if (request.method !== "DELETE") throw new HttpError(405, "method_not_allowed");
  const url = new URL(request.url);
  const id = str(url.searchParams.get("id"), 1, 64);
  if (!id) throw new HttpError(400, "invalid_input");
  const { data: row } = await supabase
    .from("devotional_images")
    .select("id,image_path")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!row) throw new HttpError(404, "not_found");
  const { error } = await supabase
    .from("devotional_images")
    .delete()
    .eq("id", id)
    .eq("owner_id", userId);
  if (error) throw new HttpError(503, "service_unavailable");
  if (row.image_path) {
    try {
      await storage.remove([row.image_path]);
    } catch {
      /* best-effort */
    }
  }
  return json({ ok: true });
}

async function handleImagesReorder(supabase, request, userId) {
  if (request.method !== "PATCH") throw new HttpError(405, "method_not_allowed");
  const body = await readJson(request);
  const devotionalId = str(body.devotionalId, 1, 64);
  if (!devotionalId || !Array.isArray(body.order)) throw new HttpError(400, "invalid_input");
  const { data: dev } = await supabase
    .from("devotionals")
    .select("id")
    .eq("id", devotionalId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!dev) throw new HttpError(404, "not_found");

  const { data: rows } = await supabase
    .from("devotional_images")
    .select("id")
    .eq("devotional_id", devotionalId)
    .eq("owner_id", userId);
  const owned = new Set((rows ?? []).map((r) => r.id));
  const order = body.order.filter((x) => typeof x === "string");
  if (order.length !== owned.size || order.some((x) => !owned.has(x))) {
    throw new HttpError(400, "invalid_input");
  }
  for (let i = 0; i < order.length; i++) {
    const { error } = await supabase
      .from("devotional_images")
      .update({ page_order: i })
      .eq("id", order[i])
      .eq("devotional_id", devotionalId)
      .eq("owner_id", userId);
    if (error) throw new HttpError(503, "service_unavailable");
  }
  return json({ ok: true });
}

/* --------------------------------- router --------------------------------- */

export async function handleApp({ request, supabase, storage }) {
  let action = null;
  try {
    action = new URL(request.url).searchParams.get("action");
  } catch {
    return fail(400, "invalid_input");
  }

  try {
    // Public auth actions.
    if (action === "signup") return await handleSignup(supabase, request);
    if (action === "login") return await handleLogin(supabase, request);

    // Everything else requires a valid session.
    const { userId } = await requireSession(supabase, request);

    switch (action) {
      case "logout":
        return await handleLogout(supabase, request);
      case "me":
        return await handleMe(supabase, request);
      case "delete_data":
        return await handleDeleteData(supabase, storage, request, userId);
      case "delete_account":
        return await handleDeleteAccount(supabase, storage, request, userId);
      case "people":
        return await handlePeople(supabase, storage, request, userId);
      case "person_photo_intent":
        return await handlePersonPhotoIntent(supabase, storage, request, userId);
      case "person_photo_confirm":
        return await handlePersonPhotoConfirm(supabase, storage, request, userId);
      case "japa":
        return await handleJapa(supabase, request, userId);
      case "milestones":
        return await handleMilestones(supabase, request, userId);
      case "devotionals":
        return await handleDevotionals(supabase, storage, request, userId);
      case "devotional":
        return await handleDevotional(supabase, storage, request, userId);
      case "image_intent":
        return await handleImageIntent(supabase, storage, request, userId);
      case "image_confirm":
        return await handleImageConfirm(supabase, storage, request, userId);
      case "image":
        return await handleImageDelete(supabase, storage, request, userId);
      case "images_reorder":
        return await handleImagesReorder(supabase, request, userId);
      default:
        return fail(404, "unknown_action");
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code);
    return fail(503, "service_unavailable");
  }
}
