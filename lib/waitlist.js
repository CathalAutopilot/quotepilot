const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MODES = new Set(["road", "sea", "air"]);
const LIMITS = {
  name: 80,
  company: 120,
  country: 80,
  email: 254,
};
const FIELD_LABELS = {
  name: "Name",
  company: "Company",
  country: "Country",
};
const MAX_BODY_BYTES = 20_000;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlPage({ title, message, status }) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #f3f8fd;
      color: #12294a;
      line-height: 1.5;
    }
    main {
      max-width: 36rem;
      margin: 0 auto;
      padding: 4rem 1.25rem;
    }
    h1 { font-size: 2rem; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em; }
    p { font-size: 1.05rem; color: #3d516f; }
    main > p:first-child { color: #12294a; font-weight: 700; }
    a { color: #1f5fd1; }
  </style>
</head>
<body>
  <main>
    <p>QuotePilot</p>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <p><a href="../">Back to QuotePilot</a></p>
  </main>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function wantsJson(request) {
  const type = request.headers.get("content-type") || "";
  const accept = request.headers.get("accept") || "";
  if (type.includes("application/json")) return true;
  return accept.includes("application/json") && !accept.includes("text/html");
}

function respond(request, payload, status) {
  if (wantsJson(request)) return json(payload, status);
  const title = payload.ok ? "You are on the list" : "We could not save that";
  let message = payload.message;
  if (payload.errors) {
    const details = Object.values(payload.errors).filter(Boolean).join(" ");
    if (details) message = `${message} ${details}`;
  }
  return htmlPage({ title, message, status });
}

function originAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === (request.headers.get("host") || "");
}

function hasBadChars(value) {
  return /[\u0000-\u001F\u007F<>]/.test(value);
}

function cleanOptional(value, field) {
  if (value == null || value === "") return { ok: true, value: "" };
  if (typeof value !== "string") {
    return { ok: false, error: `${FIELD_LABELS[field]} should be text.` };
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: true, value: "" };
  if (trimmed.length > LIMITS[field]) {
    return {
      ok: false,
      error: `${FIELD_LABELS[field]} must be ${LIMITS[field]} characters or fewer.`,
    };
  }
  if (hasBadChars(trimmed)) {
    return { ok: false, error: `${FIELD_LABELS[field]} has a character we cannot store.` };
  }
  return { ok: true, value: trimmed };
}

export function validateSubmission(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      status: 400,
      message: "Check the form and try again.",
      errors: { form: "The form could not be read." },
    };
  }

  const trap = raw.qp_leave_blank;
  if (!(trap == null || (typeof trap === "string" && trap.trim() === ""))) {
    return { ok: true, spam: true };
  }

  const errors = {};
  let email = "";
  if (typeof raw.email !== "string" || raw.email.trim() === "") {
    errors.email = "Enter your work email.";
  } else {
    email = raw.email.trim().toLowerCase();
    if (email.length > LIMITS.email || !EMAIL_PATTERN.test(email) || hasBadChars(email)) {
      errors.email = "That email does not look complete.";
    }
  }

  const optional = {};
  for (const field of ["name", "company", "country"]) {
    const cleaned = cleanOptional(raw[field], field);
    if (!cleaned.ok) errors[field] = cleaned.error;
    else optional[field] = cleaned.value;
  }

  let mode = "";
  if (!(raw.mode == null || raw.mode === "")) {
    if (typeof raw.mode !== "string") {
      errors.mode = "Choose road, sea or air, or leave the mode blank.";
    } else {
      mode = raw.mode.trim().toLowerCase();
      if (mode && !MODES.has(mode)) {
        errors.mode = "Choose road, sea or air, or leave the mode blank.";
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      status: 400,
      message: "Check the form and try again.",
      errors,
    };
  }

  return {
    ok: true,
    spam: false,
    value: {
      email,
      name: optional.name || null,
      company: optional.company || null,
      country: optional.country || null,
      mode: mode || null,
    },
  };
}

async function readPayload(request) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: "too_large" };
  }

  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { error: "too_large" };
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { error: "bad_json" };
    }
  }

  if (
    type.includes("application/x-www-form-urlencoded") ||
    type.includes("multipart/form-data")
  ) {
    let form;
    try {
      form = await request.formData();
    } catch {
      return { error: "bad_form" };
    }
    const data = {};
    for (const [key, value] of form.entries()) {
      if (typeof value !== "string") return { error: "bad_form" };
      if (data[key] === undefined) data[key] = value;
    }
    const size = JSON.stringify(data).length;
    if (size > MAX_BODY_BYTES) return { error: "too_large" };
    return { data };
  }

  return { error: "bad_type" };
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  if (method !== "POST") {
    return json(
      { ok: false, message: "Use the waitlist form to join." },
      405,
      { allow: "POST" },
    );
  }

  if (!originAllowed(request)) {
    return respond(
      request,
      { ok: false, message: "The form could not be submitted from that page." },
      403,
    );
  }

  const payload = await readPayload(request);
  if (payload.error === "too_large") {
    return respond(request, { ok: false, message: "That submission is too large." }, 413);
  }
  if (payload.error) {
    return respond(
      request,
      { ok: false, message: "The form could not be read. Try again." },
      400,
    );
  }

  const result = validateSubmission(payload.data);
  if (result.spam) {
    return respond(
      request,
      {
        ok: true,
        message: "You are on the pilot waitlist. We will write to the work email you gave.",
      },
      200,
    );
  }
  if (!result.ok) {
    return respond(
      request,
      { ok: false, message: result.message, errors: result.errors },
      result.status,
    );
  }

  const kv = env && env.WAITLIST;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return respond(
      request,
      {
        ok: false,
        message:
          "We could not save your details. Email cathal@autopilotconsultants.com and we will add you.",
      },
      500,
    );
  }

  const now = new Date().toISOString();
  let createdAt = now;
  try {
    const previous = await kv.get(result.value.email);
    if (previous) {
      try {
        const parsed = JSON.parse(previous);
        if (parsed && typeof parsed.createdAt === "string" && parsed.createdAt) {
          createdAt = parsed.createdAt;
        }
      } catch {
        createdAt = now;
      }
    }
    const record = {
      ...result.value,
      createdAt,
      updatedAt: now,
    };
    await kv.put(result.value.email, JSON.stringify(record));
  } catch {
    return respond(
      request,
      {
        ok: false,
        message:
          "We could not save your details. Email cathal@autopilotconsultants.com and we will add you.",
      },
      500,
    );
  }

  return respond(
    request,
    {
      ok: true,
      message: "You are on the pilot waitlist. We will write to the work email you gave.",
    },
    200,
  );
}
