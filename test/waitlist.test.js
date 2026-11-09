import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { onRequest as prefixedRoute } from "../functions/quotepilot/api/waitlist.js";
import { onRequest as rootRoute } from "../functions/api/waitlist.js";
import { onRequest, validateSubmission } from "../lib/waitlist.js";

function memoryKv(seed = []) {
  const store = new Map(seed);
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

async function call(body, { method = "POST", kv, headers = {}, as = "json" } = {}) {
  const namespace = kv === undefined ? memoryKv() : kv;
  const headerBag = {
    host: "127.0.0.1:4391",
    origin: "http://127.0.0.1:4391",
    ...headers,
  };
  let payload;
  if (as === "json") {
    headerBag["content-type"] = headerBag["content-type"] || "application/json";
    headerBag.accept = headerBag.accept || "application/json";
    payload = typeof body === "string" ? body : JSON.stringify(body);
  } else if (as === "form") {
    headerBag["content-type"] = "application/x-www-form-urlencoded";
    headerBag.accept = "text/html";
    payload = new URLSearchParams(body).toString();
  }
  const request = new Request("http://127.0.0.1:4391/api/waitlist", {
    method,
    headers: headerBag,
    body: method === "GET" ? undefined : payload,
  });
  const response = await onRequest({
    request,
    env: namespace ? { WAITLIST: namespace } : {},
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text, kv: namespace, headers: response.headers };
}

test("both waitlist routes use the same handler", () => {
  assert.equal(rootRoute, onRequest);
  assert.equal(prefixedRoute, onRequest);
});

test("accepts a work email and stores it under that key", async () => {
  const result = await call({
    email: "  Ops@Example-Forwarder.EU ",
    name: "Alex Meier",
    company: "Harbour Lane",
    country: "Germany",
    mode: "Road",
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  const raw = result.kv.store.get("ops@example-forwarder.eu");
  assert.ok(raw);
  const saved = JSON.parse(raw);
  assert.equal(saved.email, "ops@example-forwarder.eu");
  assert.equal(saved.name, "Alex Meier");
  assert.equal(saved.company, "Harbour Lane");
  assert.equal(saved.country, "Germany");
  assert.equal(saved.mode, "road");
  assert.equal(saved.createdAt, saved.updatedAt);
  assert.match(saved.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("keeps the original timestamp when the same email signs up again", async () => {
  const kv = memoryKv([
    [
      "ops@example.com",
      JSON.stringify({
        email: "ops@example.com",
        name: "Old",
        company: null,
        country: null,
        mode: null,
        createdAt: "2026-01-02T03:04:05.000Z",
        updatedAt: "2026-01-02T03:04:05.000Z",
      }),
    ],
  ]);
  const result = await call({ email: "ops@example.com", company: "New Desk" }, { kv });
  assert.equal(result.status, 200);
  const saved = JSON.parse(kv.store.get("ops@example.com"));
  assert.equal(saved.createdAt, "2026-01-02T03:04:05.000Z");
  assert.notEqual(saved.updatedAt, saved.createdAt);
  assert.equal(saved.company, "New Desk");
  assert.equal(saved.name, null);
});

test("rejects a missing or broken email", () => {
  const missing = validateSubmission({ email: "  " });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.email, "Enter your work email.");

  const broken = validateSubmission({ email: "not-an-email" });
  assert.equal(broken.ok, false);
  assert.equal(broken.errors.email, "That email does not look complete.");
});

test("rejects an unknown mode and overlong text", () => {
  const result = validateSubmission({
    email: "a@b.co",
    mode: "rail",
    name: "n".repeat(81),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.mode, /road, sea or air/);
  assert.match(result.errors.name, /80 characters/);
});

test("treats a filled honeypot as success and stores nothing", async () => {
  const result = await call({
    email: "bot@example.com",
    qp_leave_blank: "https://spam.example",
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.kv.store.size, 0);
});

test("optional fields can be left blank", async () => {
  const result = await call({ email: "solo@forwarder.com", mode: "" });
  const saved = JSON.parse(result.kv.store.get("solo@forwarder.com"));
  assert.equal(saved.name, null);
  assert.equal(saved.company, null);
  assert.equal(saved.country, null);
  assert.equal(saved.mode, null);
});

test("returns HTML for a no-script form post", async () => {
  const result = await call(
    { email: "desk@forwarder.de", country: "Germany" },
    { as: "form" },
  );
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /text\/html/);
  assert.match(result.text, /You are on the list/);
  assert.match(result.text, /Back to QuotePilot/);
  assert.equal(JSON.parse(result.kv.store.get("desk@forwarder.de")).country, "Germany");
});

test("rejects other methods, bad origins, and a missing KV binding", async () => {
  const get = await call(null, { method: "GET" });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");

  const origin = await call(
    { email: "a@b.co" },
    { headers: { origin: "https://evil.example" } },
  );
  assert.equal(origin.status, 403);

  const missing = await call({ email: "a@b.co" }, { kv: null });
  assert.equal(missing.status, 500);
  assert.match(missing.json.message, /cathal@autopilotconsultants.com/);
});

test("public copy stays plain and relative", async () => {
  const files = ["public/index.html", "public/app.js", "public/styles.css", "lib/waitlist.js"];
  const banned = ["\u2014", "\u2013", "seamless", "unlock", "leverage", "cutting-edge", "supercharge"];
  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const word of banned) {
      assert.equal(text.toLowerCase().includes(word), false, `${file} contains ${word}`);
    }
  }
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.match(html, /action="api\/waitlist"/);
  assert.match(html, /cathal@autopilotconsultants\.com/);
  assert.equal(html.includes("$"), false);
  assert.equal((html.match(/data-waitlist-form/g) || []).length, 2);
});
