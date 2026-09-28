// One-shot live verification against the deployed site. Not packaged, not deployed.
const HOST = "https://family-japa-k9ha5z4i396.qoder.website";
const ORIGIN = HOST;
const EMAIL = `qa-live-${Date.now()}@example.com`;
const PASSWORD = "qapass123";
const KANNADA = "ಓಂ ನಮಃ ಶಿವಾಯ";

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

async function api(action, { method = "GET", body, token, query } = {}) {
  const url = new URL(`${HOST}/functions/v1/app`);
  url.searchParams.set("action", action);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const headers = { Origin: ORIGIN, Accept: "application/json" };
  if (token) headers["x-japa-session"] = token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

// 1x1 PNG
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  console.log(`\n[1] Site reachable`);
  const root = await fetch(HOST, { headers: { Origin: ORIGIN } });
  ok("GET / -> 200", root.status === 200, `(got ${root.status})`);
  const html = await root.text();
  ok("serves app shell", html.includes('id="root"'));

  console.log(`\n[2] Auth: signup a test account`);
  let su = await api("signup", { method: "POST", body: { name: "QA", email: EMAIL, password: PASSWORD } });
  if (su.status !== 200) su = await api("login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  ok("signup 200", su.status === 200, JSON.stringify(su.data));
  const token = su.data?.token;
  ok("session token issued", typeof token === "string" && token.length > 0);

  console.log(`\n[3] Auth: login works`);
  const li = await api("login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  ok("login 200", li.status === 200, JSON.stringify(li.data));
  const me = await api("me", { token: li.data?.token });
  ok("me 200 + email", me.data?.user?.email === EMAIL, JSON.stringify(me.data));
  const bad = await api("login", { method: "POST", body: { email: EMAIL, password: "wrongwrong" } });
  ok("bad password rejected", bad.data?.error === "invalid_credentials");
  const T = li.data?.token;

  console.log(`\n[4] Default "You" person exists`);
  const people = await api("people", { token: T });
  ok("people 200", people.status === 200);
  const you = (people.data?.items ?? []).find((p) => p.name.toLowerCase() === "you");
  ok("exactly one You", (people.data?.items ?? []).filter((p) => p.name.toLowerCase() === "you").length === 1);
  ok("You listed first", people.data?.items?.[0]?.name === "You");
  await api("people", { token: T });
  const again = await api("people", { token: T });
  ok("idempotent: still one You", (again.data?.items ?? []).filter((p) => p.name.toLowerCase() === "you").length === 1);

  console.log(`\n[5] Add one Japa record for You`);
  const japa = await api("japa", { method: "POST", token: T, body: { personId: you.id, date: today(), japaCount: 108 } });
  ok("japa saved 108", japa.data?.record?.japaCount === 108, JSON.stringify(japa.data));
  const jlist = await api("japa", { token: T });
  ok("japa readable back", (jlist.data?.items ?? []).some((r) => r.japaCount === 108));

  console.log(`\n[6] Create ONE typed devotional (Kannada)`);
  const td = await api("devotionals", {
    method: "POST",
    token: T,
    body: { title: "ಶಿವ ಪಂಚಾಕ್ಷರ", kind: "text", language: "kn", body: KANNADA },
  });
  ok("typed devotional created 200", td.status === 200, JSON.stringify(td.data));
  ok("kind is text", td.data?.devotional?.kind === "text");
  const textId = td.data?.devotional?.id;

  console.log(`\n[7] It saves and can be opened (Unicode intact)`);
  const open = await api("devotional", { token: T, query: { id: textId } });
  ok("opens 200", open.status === 200);
  ok("Kannada body preserved exactly", open.data?.devotional?.body === KANNADA, JSON.stringify(open.data?.devotional?.body));
  ok("language kn", open.data?.devotional?.language === "kn");
  const lst = await api("devotionals", { token: T });
  const card = (lst.data?.items ?? []).find((d) => d.id === textId);
  ok("appears in list with preview", card?.kind === "text" && typeof card?.preview === "string" && card.preview.length > 0);

  console.log(`\n[8] Image devotional flow still works`);
  const img = await api("devotionals", { method: "POST", token: T, body: { title: "Image flow check" } });
  ok("image devotional created", img.status === 200 && img.data?.devotional?.kind === "image");
  const intent = await api("image_intent", {
    method: "POST",
    token: T,
    body: { devotionalId: img.data?.devotional?.id, contentType: "image/png", size: PNG.length },
  });
  ok("image_intent issues signed URL", intent.status === 200 && typeof intent.data?.intent?.signedUrl === "string", JSON.stringify(intent.data));
  let putOk = false;
  try {
    // The Function returns a same-origin relative signed URL; browsers resolve it
    // against the page origin, so do the same here.
    const put = await fetch(new URL(intent.data.intent.signedUrl, HOST), {
      method: "PUT",
      headers: { "content-type": "image/png", Origin: HOST },
      body: PNG,
    });
    putOk = put.status < 300;
    if (!putOk) console.log(`    PUT -> ${put.status} ${(await put.text()).slice(0, 200)}`);
  } catch (e) {
    console.log("    PUT threw:", e.message);
  }
  ok("upload to storage succeeded", putOk);
  const confirm = await api("image_confirm", {
    method: "POST",
    token: T,
    body: { devotionalId: img.data?.devotional?.id, objectPath: intent.data?.intent?.objectPath, size: PNG.length, contentType: "image/png" },
  });
  ok("image_confirm 200", confirm.status === 200, JSON.stringify(confirm.data));
  ok("image has viewable URL", typeof confirm.data?.image?.url === "string");

  console.log(`\n[9] Milestones still load`);
  const ms = await api("milestones", { token: T });
  ok("milestones 200", ms.status === 200, JSON.stringify(ms.data));
  ok("totalJapa reflects real records", ms.data?.totalJapa === 108, `(got ${ms.data?.totalJapa})`);
  const mcreate = await api("milestones", { method: "POST", token: T, body: { name: "1 Lakh Japa", targetCount: 100000 } });
  ok("milestone create works", mcreate.status === 200 && mcreate.data?.milestone?.remaining === 99892, JSON.stringify(mcreate.data));

  console.log(`\nTest account: ${EMAIL}`);
  console.log(`RESULT live: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
