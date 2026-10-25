// Local-only live check for the two deletion pages against the deployed Function.
// Creates one throwaway QA account, deletes its data, then deletes the account,
// so the test leaves no production records behind. Never deployed.
const HOST = "https://family-japa-k9ha5z4i396.qoder.website";

let pass = 0;
let fail = 0;
const eq = (name, actual, expected) => {
  const okv = actual === expected;
  if (okv) pass++;
  else fail++;
  console.log(`  ${okv ? "PASS" : "FAIL"}  ${name}${okv ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
};

async function fn(action, { method = "GET", body, token } = {}) {
  const url = `${HOST}/functions/v1/app?action=${action}`;
  const headers = { Accept: "application/json", Origin: HOST };
  if (token) headers["x-japa-session"] = token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, data };
}

async function page(path) {
  const res = await fetch(`${HOST}${path}`, { headers: { Accept: "text/html,application/xhtml+xml" } });
  const html = await res.text();
  return { status: res.status, html };
}

async function main() {
  const stamp = Date.now();
  const email = `qa-del-${stamp}@example.com`;
  const password = `delete${stamp}x`;

  console.log("\n== Pages served publicly ==");
  for (const p of ["/delete-account", "/delete-account/", "/delete-account.html", "/delete-data", "/delete-data/", "/delete-data.html", "/privacy-policy"]) {
    const r = await page(p);
    eq(`GET ${p} -> 200`, r.status, 200);
    if (!r.html.includes(`<script type="module"`)) eq(`GET ${p} serves the app shell`, false, true);
  }

  console.log("\n== Real account lifecycle on the deployed backend ==");
  let r = await fn("signup", { method: "POST", body: { name: "QA Delete", email, password } });
  eq("signup 200", r.status, 200);
  const token = r.data?.token;

  r = await fn("people", { token });
  const youId = r.data?.items?.[0]?.id;
  eq("default You person exists", r.data?.items?.[0]?.name, "You");

  r = await fn("japa", { method: "POST", token, body: { personId: youId, date: "2026-10-20", japaCount: 108 } });
  eq("japa record added", r.data?.record?.japaCount, 108);
  await fn("milestones", { method: "POST", token, body: { name: "QA Milestone", targetCount: 1000 } });
  r = await fn("devotionals", { method: "POST", token, body: { title: "QA Text", kind: "text", language: "ta", body: "ஓம் நமசிவாய" } });
  eq("typed devotional added", r.data?.devotional?.kind, "text");

  r = await fn("delete_data", { method: "POST", token, body: { email: "wrong@example.com", password, confirm: true } });
  eq("foreign email rejected", r.status, 403);
  r = await fn("delete_data", { method: "POST", token, body: { email, password: "not-the-password", confirm: true } });
  eq("wrong password rejected", r.data?.error, "invalid_credentials");

  r = await fn("delete_data", { method: "POST", token, body: { email, password, confirm: true } });
  eq("delete_data 200", r.status, 200);
  eq("delete_data status deleted", r.data?.status, "deleted");
  eq("delete_data kept the account", r.data?.account, "retained");
  eq("delete_data removed the japa record", r.data?.deleted?.japaRecords, 1);
  eq("delete_data removed the devotional", r.data?.deleted?.devotionals, 1);
  eq("delete_data removed the typed text", r.data?.deleted?.texts, 1);
  eq("delete_data removed the milestone", r.data?.deleted?.milestones, 1);
  eq("delete_data had no failures", (r.data?.failedTables ?? []).length, 0);

  r = await fn("japa", { token });
  eq("japa list empty after delete_data", r.data?.items?.length, 0);
  r = await fn("devotionals", { token });
  eq("devotional list empty after delete_data", r.data?.items?.length, 0);
  r = await fn("me", { token });
  eq("session still valid after delete_data", r.status, 200);

  r = await fn("delete_account", { method: "POST", token, body: { email, password, confirm: true } });
  eq("delete_account 200", r.status, 200);
  eq("delete_account status deleted", r.data?.status, "deleted");
  eq("delete_account account deleted", r.data?.account, "deleted");
  eq("delete_account no failed tables", (r.data?.failedTables ?? []).length, 0);

  r = await fn("me", { token });
  eq("old session rejected after delete_account", r.status, 401);
  r = await fn("login", { method: "POST", body: { email, password } });
  eq("account cannot sign in after delete_account", r.data?.error, "invalid_credentials");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
