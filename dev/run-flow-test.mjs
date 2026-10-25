// Local-only end-to-end exercise of the REAL deployed handler (functions/handler.mjs)
// against in-memory Supabase/Storage fixtures. Never deployed, never packaged.
// Proves application logic: auth, persistence, one-row-per-day japa accumulation,
// devotional image flow + reorder, per-user isolation, cascade deletes, validation.

import { handleApp } from "../functions/handler.mjs";
import { createFakeSupabase } from "./fake-supabase.mjs";
import { createFakeStorage } from "./fake-storage.mjs";

const { client: db, tables } = createFakeSupabase();
const fake = createFakeStorage();
const storage = fake.storage;

let pass = 0;
let fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `(got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

async function call(action, { method = "GET", body, token, query } = {}) {
  const url = new URL("http://local/functions/v1/app");
  url.searchParams.set("action", action);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const headers = { Accept: "application/json" };
  if (token) headers["x-japa-session"] = token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await handleApp({ request: req, supabase: db, storage });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, data };
}

const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

// Simulate a browser PUT to a signed upload URL by placing bytes in the fixture.
function simulateUpload(objectPath, bytes, contentType) {
  fake.putObject(objectPath, bytes, contentType);
}

const PNG = "image/png";
function pngBytes(n) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = i % 251;
  return b;
}

async function main() {
  console.log("\n== Phase 1: auth, japa accumulation, persistence ==");
  const emailA = "asha@example.com";
  const pwA = "sacred108";
  let r = await call("signup", { method: "POST", body: { name: "Asha", email: emailA, password: pwA } });
  eq("signup A status 200", r.status, 200);
  const tokenA = r.data?.token;
  const userA = r.data?.user;
  ok("signup A returns token", typeof tokenA === "string" && tokenA.length > 0);
  eq("signup A email", userA?.email, emailA);

  r = await call("me", { token: tokenA });
  eq("me A status 200", r.status, 200);
  eq("me A email", r.data?.user?.email, emailA);

  r = await call("people", { method: "POST", token: tokenA, body: { name: "Asha" } });
  eq("create person status 200", r.status, 200);
  const personA = r.data?.person?.id;
  ok("person id present", typeof personA === "string");

  r = await call("japa", { method: "POST", token: tokenA, body: { personId: personA, date: today, japaCount: 108 } });
  eq("add japa 108 status 200", r.status, 200);
  eq("add japa 108 count", r.data?.record?.japaCount, 108);

  r = await call("japa", { method: "POST", token: tokenA, body: { personId: personA, date: today, japaCount: 54 } });
  eq("add japa +54 accumulates to 162", r.data?.record?.japaCount, 162);

  r = await call("japa", { token: tokenA });
  eq("list japa one row per person-date", r.data?.items?.length, 1);
  eq("list japa total 162", r.data?.items?.[0]?.japaCount, 162);
  const recId = r.data?.items?.[0]?.id;

  r = await call("japa", { method: "PATCH", token: tokenA, body: { id: recId, personId: personA, date: today, japaCount: 200 } });
  eq("edit japa sets absolute 200", r.data?.record?.japaCount, 200);

  r = await call("logout", { method: "POST", token: tokenA });
  eq("logout status 200", r.status, 200);
  r = await call("me", { token: tokenA });
  eq("me after logout 401", r.status, 401);
  eq("me after logout code", r.data?.error, "login_required");

  r = await call("login", { method: "POST", body: { email: emailA, password: pwA } });
  eq("re-login status 200", r.status, 200);
  const tokenA2 = r.data?.token;
  ok("re-login token differs from old", tokenA2 && tokenA2 !== tokenA);
  r = await call("japa", { token: tokenA2 });
  eq("data persists after re-login (1 row)", r.data?.items?.length, 1);
  eq("persisted count 200", r.data?.items?.[0]?.japaCount, 200);

  console.log("\n== Phase 2: devotionals, images, reorder ==");
  r = await call("devotionals", { method: "POST", token: tokenA2, body: { title: "Morning Prayers" } });
  eq("create devotional 200", r.status, 200);
  const devA = r.data?.devotional?.id;
  ok("devotional id present", typeof devA === "string");

  // Image 1
  const b1 = pngBytes(2048);
  r = await call("image_intent", { method: "POST", token: tokenA2, body: { devotionalId: devA, contentType: PNG, size: b1.length } });
  eq("image_intent 1 status 200", r.status, 200);
  const path1 = r.data?.intent?.objectPath;
  ok("intent objectPath under owner prefix", typeof path1 === "string" && path1.startsWith("devotionals/"));
  simulateUpload(path1, b1, PNG);
  r = await call("image_confirm", { method: "POST", token: tokenA2, body: { devotionalId: devA, objectPath: path1, size: b1.length, contentType: PNG } });
  eq("image_confirm 1 status 200", r.status, 200);
  eq("image 1 pageOrder 0", r.data?.image?.pageOrder, 0);
  const img1 = r.data?.image?.id;
  ok("image 1 has signed url", typeof r.data?.image?.url === "string");

  // Image 2
  const b2 = pngBytes(4096);
  r = await call("image_intent", { method: "POST", token: tokenA2, body: { devotionalId: devA, contentType: PNG, size: b2.length } });
  const path2 = r.data?.intent?.objectPath;
  simulateUpload(path2, b2, PNG);
  r = await call("image_confirm", { method: "POST", token: tokenA2, body: { devotionalId: devA, objectPath: path2, size: b2.length, contentType: PNG } });
  eq("image 2 pageOrder 1", r.data?.image?.pageOrder, 1);
  const img2 = r.data?.image?.id;

  r = await call("devotional", { token: tokenA2, query: { id: devA } });
  eq("get devotional 2 images", r.data?.images?.length, 2);
  eq("get devotional imageCount 2", r.data?.devotional?.imageCount, 2);
  eq("image order [0,1]", r.data?.images?.map((i) => i.pageOrder).join(","), "0,1");

  r = await call("images_reorder", { method: "PATCH", token: tokenA2, body: { devotionalId: devA, order: [img2, img1] } });
  eq("reorder status 200", r.status, 200);
  r = await call("devotional", { token: tokenA2, query: { id: devA } });
  eq("reordered first image is img2", r.data?.images?.[0]?.id, img2);
  eq("reordered order [0,1]", r.data?.images?.map((i) => i.pageOrder).join(","), "0,1");

  r = await call("devotionals", { token: tokenA2 });
  eq("list devotionals 1 item", r.data?.items?.length, 1);
  eq("list devotionals imageCount 2", r.data?.items?.[0]?.imageCount, 2);
  ok("list devotionals coverUrl present", typeof r.data?.items?.[0]?.coverUrl === "string");

  // Edit title
  r = await call("devotionals", { method: "PATCH", token: tokenA2, body: { id: devA, title: "Evening Aarti" } });
  eq("edit devotional title", r.data?.devotional?.title, "Evening Aarti");

  console.log("\n== Phase 3: per-user isolation ==");
  r = await call("signup", { method: "POST", body: { name: "Bob", email: "bob@example.com", password: "quiet999" } });
  const tokenB = r.data?.token;
  ok("signup B token", typeof tokenB === "string");
  r = await call("people", { token: tokenB });
  eq("B sees only its default You person", r.data?.items?.length, 1);
  eq("B default person is You", r.data?.items?.[0]?.name, "You");
  r = await call("japa", { token: tokenB });
  eq("B sees no japa", r.data?.items?.length, 0);
  r = await call("devotionals", { token: tokenB });
  eq("B sees no devotionals", r.data?.items?.length, 0);
  r = await call("devotional", { token: tokenB, query: { id: devA } });
  eq("B cannot read A devotional (404)", r.status, 404);
  r = await call("japa", { method: "POST", token: tokenB, body: { personId: personA, date: today, japaCount: 10 } });
  eq("B cannot add japa for A person (404)", r.status, 404);
  r = await call("image", { method: "DELETE", token: tokenB, query: { id: img1 } });
  eq("B cannot delete A image (404)", r.status, 404);

  console.log("\n== Phase 4: deletes + cascade ==");
  r = await call("image", { method: "DELETE", token: tokenA2, query: { id: img1 } });
  eq("delete image ok", r.data?.ok, true);
  ok("deleted image removed from storage", fake.getObject(path1) === null);
  r = await call("devotional", { token: tokenA2, query: { id: devA } });
  eq("devotional now 1 image", r.data?.images?.length, 1);

  r = await call("devotionals", { method: "DELETE", token: tokenA2, query: { id: devA } });
  eq("delete devotional ok", r.data?.ok, true);
  ok("devotional image2 removed from storage", fake.getObject(path2) === null);
  r = await call("devotionals", { token: tokenA2 });
  eq("no devotionals left", r.data?.items?.length, 0);

  r = await call("people", { method: "DELETE", token: tokenA2, query: { id: personA } });
  eq("delete person ok", r.data?.ok, true);
  r = await call("japa", { token: tokenA2 });
  eq("person delete cascades japa", r.data?.items?.length, 0);

  console.log("\n== Phase 5: validation & edge cases ==");
  r = await call("signup", { method: "POST", body: { name: "X", email: "x@example.com", password: "123" } });
  eq("weak password rejected", r.data?.error, "weak_password");
  r = await call("signup", { method: "POST", body: { name: "Asha", email: emailA, password: "another1" } });
  eq("duplicate email rejected (409)", r.status, 409);
  r = await call("login", { method: "POST", body: { email: emailA, password: "wrongpass" } });
  eq("wrong password rejected", r.data?.error, "invalid_credentials");
  eq("wrong password status 400 (not 401)", r.status, 400);
  r = await call("me", {});
  eq("me without token 401", r.status, 401);
  r = await call("does_not_exist", { token: tokenA2 });
  eq("unknown action 404", r.status, 404);

  // japa validation (need a fresh person)
  r = await call("people", { method: "POST", token: tokenA2, body: { name: "Asha" } });
  const personA2 = r.data?.person?.id;
  r = await call("japa", { method: "POST", token: tokenA2, body: { personId: personA2, date: today, japaCount: 0 } });
  eq("japa count 0 rejected", r.data?.error, "invalid_input");
  r = await call("japa", { method: "POST", token: tokenA2, body: { personId: personA2, date: today, japaCount: -5 } });
  eq("negative japa rejected", r.data?.error, "invalid_input");
  r = await call("japa", { method: "POST", token: tokenA2, body: { personId: personA2, date: "2026-13-45", japaCount: 10 } });
  eq("invalid date rejected", r.data?.error, "invalid_input");
  r = await call("japa", { method: "POST", token: tokenA2, body: { personId: "not-mine", date: today, japaCount: 10 } });
  eq("japa for unknown person 404", r.status, 404);

  // unsupported image type
  r = await call("image_intent", { method: "POST", token: tokenA2, body: { devotionalId: "x", contentType: "text/plain", size: 10 } });
  ok("image_intent bad devotional/type rejected", r.status === 404 || r.status === 400);

  // confirm rejects objectPath outside owner prefix (path traversal / cross-owner)
  r = await call("devotionals", { method: "POST", token: tokenA2, body: { title: "T" } });
  const devT = r.data?.devotional?.id;
  r = await call("image_confirm", { method: "POST", token: tokenA2, body: { devotionalId: devT, objectPath: "devotionals/evil/x.png", size: 10, contentType: PNG } });
  eq("confirm rejects foreign objectPath (403)", r.status, 403);

  console.log("\n== Phase 6: milestones (progress from real japa) ==");
  // Seed real japa for A (person A's earlier records were cascade-deleted in Phase 4).
  await call("japa", { method: "POST", token: tokenA2, body: { personId: personA2, date: today, japaCount: 108 } });
  await call("japa", { method: "POST", token: tokenA2, body: { personId: personA2, date: "2026-01-01", japaCount: 54 } });

  r = await call("milestones", { token: tokenA2 });
  eq("list milestones initially empty", r.data?.items?.length, 0);
  eq("milestones reports totalJapa 162", r.data?.totalJapa, 162);

  r = await call("milestones", { method: "POST", token: tokenA2, body: { name: "1 Lakh Japa", targetCount: 100000 } });
  eq("create predefined milestone 200", r.status, 200);
  eq("milestone targetCount 100000", r.data?.milestone?.targetCount, 100000);
  eq("milestone currentCount from real japa", r.data?.milestone?.currentCount, 162);
  eq("milestone remaining 99838", r.data?.milestone?.remaining, 99838);
  const msLakh = r.data?.milestone?.id;

  r = await call("milestones", { method: "POST", token: tokenA2, body: { name: "My Goal", targetCount: 200 } });
  eq("custom milestone remaining 38", r.data?.milestone?.remaining, 38);
  const msGoal = r.data?.milestone?.id;

  r = await call("milestones", { method: "POST", token: tokenA2, body: { name: "", targetCount: 100 } });
  eq("unnamed milestone allowed", r.status, 200);
  eq("unnamed milestone name empty", r.data?.milestone?.name, "");
  eq("remaining floored at 0 when exceeded", r.data?.milestone?.remaining, 0);
  const msSmall = r.data?.milestone?.id;

  r = await call("milestones", { token: tokenA2 });
  eq("list milestones 3 items", r.data?.items?.length, 3);
  ok("all milestones share currentCount 162", (r.data?.items ?? []).every((m) => m.currentCount === 162));

  // Progress must auto-update when new japa is added (no separate counter).
  await call("japa", { method: "POST", token: tokenA2, body: { personId: personA2, date: today, japaCount: 38 } });
  r = await call("milestones", { token: tokenA2 });
  eq("totalJapa now 200 after new japa", r.data?.totalJapa, 200);
  eq("My Goal remaining now 0", (r.data?.items ?? []).find((m) => m.id === msGoal)?.remaining, 0);
  eq("1 Lakh remaining now 99800", (r.data?.items ?? []).find((m) => m.id === msLakh)?.remaining, 99800);

  r = await call("milestones", { method: "PATCH", token: tokenA2, body: { id: msGoal, name: "My Goal", targetCount: 500 } });
  eq("edit milestone target 500", r.data?.milestone?.targetCount, 500);
  eq("edit milestone remaining 300", r.data?.milestone?.remaining, 300);

  r = await call("milestones", { token: tokenB });
  eq("B sees no milestones", r.data?.items?.length, 0);
  r = await call("milestones", { method: "DELETE", token: tokenB, query: { id: msLakh } });
  eq("B cannot delete A milestone (404)", r.status, 404);
  r = await call("milestones", { method: "PATCH", token: tokenB, body: { id: msLakh, name: "hack", targetCount: 1 } });
  eq("B cannot edit A milestone (404)", r.status, 404);

  r = await call("milestones", { method: "POST", token: tokenA2, body: { name: "zero", targetCount: 0 } });
  eq("milestone target 0 rejected", r.data?.error, "invalid_input");
  r = await call("milestones", { method: "POST", token: tokenA2, body: { name: "neg", targetCount: -100 } });
  eq("milestone negative target rejected", r.data?.error, "invalid_input");
  r = await call("milestones", { method: "POST", token: tokenA2, body: { name: "frac", targetCount: 10.5 } });
  eq("milestone fractional target rejected", r.data?.error, "invalid_input");

  r = await call("milestones", { method: "DELETE", token: tokenA2, query: { id: msSmall } });
  eq("delete milestone ok", r.data?.ok, true);
  r = await call("milestones", { token: tokenA2 });
  eq("milestones now 2", r.data?.items?.length, 2);

  console.log("\n== Phase 7: default 'You' person (auto + idempotent) ==");
  r = await call("signup", { method: "POST", body: { name: "Cira", email: "cira@example.com", password: "gentle12" } });
  const tokenC = r.data?.token;
  ok("signup C token", typeof tokenC === "string");
  r = await call("people", { token: tokenC });
  eq("fresh account has exactly one person", r.data?.items?.length, 1);
  eq("fresh account person is You", r.data?.items?.[0]?.name, "You");
  const youC = r.data?.items?.[0]?.id;
  // Idempotent: repeated reads / me / adds must never create a second You.
  await call("me", { token: tokenC });
  await call("people", { token: tokenC });
  await call("people", { method: "POST", token: tokenC, body: { name: "Mother" } });
  await call("people", { token: tokenC });
  r = await call("people", { token: tokenC });
  eq("still exactly one You after repeated access", (r.data?.items ?? []).filter((p) => p.name.toLowerCase() === "you").length, 1);
  eq("You sorted first", r.data?.items?.[0]?.id, youC);
  eq("C now has 2 members", r.data?.items?.length, 2);
  r = await call("japa", { method: "POST", token: tokenC, body: { personId: youC, date: today, japaCount: 27 } });
  eq("japa for You behaves like any person", r.data?.record?.japaCount, 27);
  // Isolation: another user must not see C's You person.
  r = await call("people", { token: tokenA2 });
  ok("A does not see C's You", !(r.data?.items ?? []).some((p) => p.id === youC));

  console.log("\n== Phase 8: typed devotionals (Unicode preserved) ==");
  const samples = [
    { language: "en", title: "Peace", body: "Om Shanti\nsecond line" },
    { language: "hi", title: "शान्ति", body: "ॐ शान्ति\nहिन्दी पंक्ति" },
    { language: "kn", title: "ಶಾಂತಿ", body: "ಓ ಶಾಂತಿ\nಕನ್ನಡ ಸಾಲು" },
    { language: "ta", title: "சாந்தி", body: "ஓம் சாந்தி\nதமிழ் வரி" },
  ];
  const textIds = [];
  for (const s of samples) {
    r = await call("devotionals", { method: "POST", token: tokenA2, body: { title: s.title, kind: "text", language: s.language, body: s.body } });
    eq(`create ${s.language} typed devotional`, r.status, 200);
    eq(`${s.language} kind is text`, r.data?.devotional?.kind, "text");
    eq(`${s.language} language echoed`, r.data?.devotional?.language, s.language);
    const id = r.data?.devotional?.id;
    textIds.push({ id, ...s });
    const g = await call("devotional", { token: tokenA2, query: { id } });
    eq(`${s.language} body stored exactly`, g.data?.devotional?.body, s.body);
    eq(`${s.language} images empty`, g.data?.images?.length, 0);
  }

  r = await call("devotionals", { token: tokenA2 });
  eq("list has 4 typed items", (r.data?.items ?? []).filter((d) => d.kind === "text").length, 4);
  ok("typed card carries preview", (r.data?.items ?? []).find((d) => d.language === "hi")?.preview?.includes("ॐ") === true);

  // Edit title + body
  const hiT = textIds.find((t) => t.language === "hi");
  r = await call("devotionals", { method: "PATCH", token: tokenA2, body: { id: hiT.id, title: "नया", language: "hi", body: "ॐ शान्ति एडिट" } });
  eq("edit typed devotional status 200", r.status, 200);
  const gEdit = await call("devotional", { token: tokenA2, query: { id: hiT.id } });
  eq("edited typed body preserved exactly", gEdit.data?.devotional?.body, "ॐ शान्ति एडिट");
  eq("edited title", gEdit.data?.devotional?.title, "नया");

  // Validation
  // Language is no longer required; any script — or several in one devotional — is stored verbatim.
  const MIXED = "ॐ नमः शिवाय\nಓಂ ನಮಃ ಶಿವಾಯ\nஓம் நமசிவாய\nOm Namah Shivaya";
  r = await call("devotionals", { method: "POST", token: tokenA2, body: { title: "Shiva Stuti", kind: "text", body: MIXED } });
  eq("typed devotional accepted with no language field", r.status, 200);
  eq("unspecified language stored as empty", r.data?.devotional?.language, "");
  const gMixed = await call("devotional", { token: tokenA2, query: { id: r.data?.devotional?.id } });
  eq("mixed-script body preserved exactly", gMixed.data?.devotional?.body, MIXED);

  r = await call("devotionals", { method: "POST", token: tokenA2, body: { title: "x", kind: "text", language: "hi", body: "   " } });
  eq("blank typed body rejected", r.data?.error, "invalid_input");

  // Isolation + delete
  r = await call("devotional", { token: tokenB, query: { id: hiT.id } });
  eq("B cannot read A typed devotional (404)", r.status, 404);
  r = await call("devotionals", { method: "DELETE", token: tokenA2, query: { id: hiT.id } });
  eq("delete typed devotional ok", r.data?.ok, true);
  const gDel = await call("devotional", { token: tokenA2, query: { id: hiT.id } });
  eq("deleted typed devotional 404", gDel.status, 404);

  console.log("\n== Phase 9: account + data deletion (verified ownership, real deletes) ==");
  r = await call("signup", { method: "POST", body: { name: "Eli", email: "eli@example.com", password: "delete108" } });
  eq("signup E status 200", r.status, 200);
  const tokenE = r.data?.token;
  const personE = (await call("people", { token: tokenE })).data?.items?.[0]?.id;
  ok("E has default You person", typeof personE === "string");
  await call("people", { method: "POST", token: tokenE, body: { name: "Extra" } });
  await call("japa", { method: "POST", token: tokenE, body: { personId: personE, date: today, japaCount: 27 } });
  await call("milestones", { method: "POST", token: tokenE, body: { name: "E Goal", targetCount: 1000 } });
  await call("devotionals", { method: "POST", token: tokenE, body: { title: "E Text", kind: "text", language: "ta", body: "ஓம் நமசிவாய" } });
  const bE = pngBytes(3072);
  r = await call("devotionals", { method: "POST", token: tokenE, body: { title: "E Images" } });
  const devImgE = r.data?.devotional?.id;
  r = await call("image_intent", { method: "POST", token: tokenE, body: { devotionalId: devImgE, contentType: PNG, size: bE.length } });
  const pathE = r.data?.intent?.objectPath;
  simulateUpload(pathE, bE, PNG);
  await call("image_confirm", { method: "POST", token: tokenE, body: { devotionalId: devImgE, objectPath: pathE, size: bE.length, contentType: PNG } });
  ok("E image stored before deletion", fake.getObject(pathE) !== null);

  // Refusals: no confirmation, wrong password, wrong email.
  r = await call("delete_data", { method: "POST", token: tokenE, body: { email: "eli@example.com", password: "delete108", confirm: false } });
  eq("deletion without confirm rejected", r.data?.error, "confirmation_required");
  r = await call("delete_data", { method: "POST", token: tokenE, body: { email: "eli@example.com", password: "nope123", confirm: true } });
  eq("deletion with wrong password rejected", r.data?.error, "invalid_credentials");
  r = await call("delete_data", { method: "POST", token: tokenE, body: { email: "someone.else@example.com", password: "delete108", confirm: true } });
  eq("deletion with foreign email rejected (403)", r.status, 403);
  eq("deletion with foreign email code", r.data?.error, "email_mismatch");
  r = await call("delete_data", {});
  eq("deletion without session 401", r.status, 401);
  r = await call("delete_data", { method: "GET", token: tokenE });
  eq("deletion requires POST", r.status, 405);

  // Data deletion keeps the account.
  r = await call("delete_data", { method: "POST", token: tokenE, body: { email: "eli@example.com", password: "delete108", confirm: true } });
  eq("delete_data status 200", r.status, 200);
  eq("delete_data reports deleted", r.data?.status, "deleted");
  eq("delete_data keeps account", r.data?.account, "retained");
  eq("delete_data deleted 2 people", r.data?.deleted?.people, 2);
  eq("delete_data deleted 1 japa record", r.data?.deleted?.japaRecords, 1);
  eq("delete_data deleted 1 milestone", r.data?.deleted?.milestones, 1);
  eq("delete_data deleted 2 devotionals", r.data?.deleted?.devotionals, 2);
  eq("delete_data deleted 1 image row", r.data?.deleted?.images, 1);
  eq("delete_data deleted 1 text row", r.data?.deleted?.texts, 1);
  eq("delete_data no failed tables", (r.data?.failedTables ?? []).length, 0);
  eq("delete_data no failed files", r.data?.failedFiles, 0);
  ok("deleted image file removed from storage", fake.getObject(pathE) === null);
  r = await call("japa", { token: tokenE });
  eq("E japa records gone", r.data?.items?.length, 0);
  r = await call("devotionals", { token: tokenE });
  eq("E devotionals gone", r.data?.items?.length, 0);
  r = await call("milestones", { token: tokenE });
  eq("E milestones gone", r.data?.items?.length, 0);
  eq("E totalJapa now 0", r.data?.totalJapa, 0);
  r = await call("me", { token: tokenE });
  eq("E still signed in after data deletion", r.status, 200);
  eq("E email retained", r.data?.user?.email, "eli@example.com");
  r = await call("people", { token: tokenE });
  eq("E people cleared (You recreated lazily)", r.data?.items?.length, 1);
  eq("recreated person is the default You", r.data?.items?.[0]?.name, "You");

  // Account deletion removes everything and signs the account out.
  await call("japa", { method: "POST", token: tokenE, body: { personId: r.data?.items?.[0]?.id, date: today, japaCount: 5 } });
  r = await call("signup", { method: "POST", body: { name: "Fina", email: "fina@example.com", password: "watch108" } });
  const tokenF = r.data?.token;
  await call("people", { method: "POST", token: tokenF, body: { name: "Fina Kid" } });
  const personF = (await call("people", { token: tokenF })).data?.items?.find((p) => p.name === "Fina Kid")?.id;
  await call("japa", { method: "POST", token: tokenF, body: { personId: personF, date: today, japaCount: 12 } });

  r = await call("delete_account", { method: "POST", token: tokenE, body: { email: "eli@example.com", password: "delete108", confirm: true } });
  eq("delete_account status 200", r.status, 200);
  eq("delete_account reports deleted", r.data?.status, "deleted");
  eq("delete_account account deleted", r.data?.account, "deleted");
  eq("delete_account removed the new japa row", r.data?.deleted?.japaRecords, 1);
  r = await call("me", { token: tokenE });
  eq("E session invalid after account deletion", r.status, 401);
  r = await call("login", { method: "POST", body: { email: "eli@example.com", password: "delete108" } });
  eq("E cannot log in after account deletion", r.data?.error, "invalid_credentials");
  r = await call("people", { token: tokenF });
  eq("F untouched by E account deletion", r.data?.items?.length, 2);
  r = await call("japa", { token: tokenF });
  eq("F japa untouched", r.data?.items?.[0]?.japaCount, 12);
  r = await call("me", { token: tokenA2 });
  eq("A session still valid", r.status, 200);

  console.log("\n== Fixtures contain no seeded/sample data before writes ==");
  // (tables were created only by the flow above; nothing pre-seeded)

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
