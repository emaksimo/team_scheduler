const NOTION_VERSION = "2026-03-11";
const PIN_RE = /^\d{4}$/;

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Project-Pin, X-Feedback-Admin",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "team-scheduler-api" }, 200, cors);
      }

      if (path === "/feedback") {
        return await handleFeedback(request, env, cors);
      }

      const feedbackDeleteMatch = path.match(/^\/feedback\/([^/]+)$/);
      if (feedbackDeleteMatch && request.method === "DELETE") {
        return await deleteFeedback(
          request,
          env,
          decodeURIComponent(feedbackDeleteMatch[1]),
          cors
        );
      }

      if (path === "/projects" && request.method === "GET") {
        return await listProjects(env, cors);
      }

      if (path === "/project" && request.method === "POST") {
        return await createProject(env, await request.json(), cors);
      }

      const initMatch = path.match(/^\/project\/(.+)\/initialize$/);
      if (initMatch && request.method === "POST") {
        return await initializeProject(
          env,
          decodeURIComponent(initMatch[1]),
          await request.json(),
          cors
        );
      }

      const projectMatch = path.match(/^\/project\/(.+)$/);
      if (projectMatch) {
        const name = decodeURIComponent(projectMatch[1]);
        const pin = request.headers.get("X-Project-Pin") || "";

        if (request.method === "GET") {
          return await getProject(env, name, pin, cors);
        }
        if (request.method === "PUT") {
          return await updateProject(env, name, pin, await request.json(), cors);
        }
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: err?.message || String(err) }, 500, cors);
    }
  }
};

async function handleFeedback(request, env, cors) {
  if (!env.FEEDBACK) {
    return json({ error: "FEEDBACK KV binding is missing." }, 500, cors);
  }

  if (request.method === "GET") {
    let messages = (await env.FEEDBACK.get("public-messages", "json")) || [];
    if (!Array.isArray(messages)) messages = [];
    return json({ messages }, 200, cors);
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request." }, 400, cors);
    }

    const name = cleanFeedbackText(body?.name, 40);
    const message = cleanFeedbackText(body?.message, 1000);

    if (!name) return json({ error: "Please enter your name." }, 400, cors);
    if (!message) return json({ error: "Please enter a message." }, 400, cors);

    let messages = (await env.FEEDBACK.get("public-messages", "json")) || [];
    if (!Array.isArray(messages)) messages = [];

    const newMessage = {
      id: crypto.randomUUID(),
      name,
      message,
      createdAt: new Date().toISOString()
    };

    messages.push(newMessage);
    messages = messages.slice(-200);

    await env.FEEDBACK.put("public-messages", JSON.stringify(messages));
    return json({ ok: true, message: newMessage }, 201, cors);
  }

  return json({ error: "Method not allowed." }, 405, cors);
}

async function deleteFeedback(request, env, id, cors) {
  if (!env.FEEDBACK) {
    return json({ error: "FEEDBACK KV binding is missing." }, 500, cors);
  }
  if (!env.FEEDBACK_ADMIN_PIN) {
    return json({ error: "Feedback admin secret is not configured." }, 500, cors);
  }

  const supplied = request.headers.get("X-Feedback-Admin") || "";
  if (!supplied) {
    return json({ error: "Admin PIN/password is required." }, 401, cors);
  }

  const suppliedHash = await sha256(supplied);
  const secretHash = await sha256(String(env.FEEDBACK_ADMIN_PIN));
  if (!timingSafeEqual(suppliedHash, secretHash)) {
    return json({ error: "Incorrect admin PIN/password." }, 403, cors);
  }

  let messages = (await env.FEEDBACK.get("public-messages", "json")) || [];
  if (!Array.isArray(messages)) messages = [];

  const before = messages.length;
  messages = messages.filter(item => item?.id !== id);

  if (messages.length === before) {
    return json({ error: "Message not found." }, 404, cors);
  }

  await env.FEEDBACK.put("public-messages", JSON.stringify(messages));
  return json({ ok: true, deletedId: id }, 200, cors);
}

function cleanFeedbackText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

async function notionRequest(env, path, options = {}) {
  const response = await fetch("https://api.notion.com/v1" + path, {
    ...options,
    headers: {
      "Authorization": `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `Notion error ${response.status}`);
  return data;
}

async function listProjects(env, cors) {
  const data = await notionRequest(env, `/data_sources/${env.NOTION_DATABASE_ID}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 100 })
  });
  return json(data.results.map(page => {
    const raw = readJson(page.properties["Project JSON"]);
    return {
      id: page.id,
      name: readTitle(page.properties["Name"]),
      initialized: !!(raw && raw._auth && raw.data)
    };
  }), 200, cors);
}

async function createProject(env, body, cors) {
  const name = String(body?.name || "").trim();
  const pin = String(body?.pin || "").trim();
  if (!name) return json({ error: "Project name is required" }, 400, cors);
  if (!PIN_RE.test(pin)) return json({ error: "PIN must contain exactly 4 digits" }, 400, cors);
  if (await findProject(env, name)) return json({ error: "Project already exists" }, 409, cors);

  const wrapped = await wrapProject(pin, body.project || defaultProject(name));
  const page = await notionRequest(env, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: env.NOTION_DATABASE_ID },
      properties: {
        "Name": { title: [{ text: { content: name } }] },
        "Project JSON": { rich_text: richTextChunks(JSON.stringify(wrapped)) }
      }
    })
  });
  return json({ ok: true, id: page.id, name, project: wrapped.data }, 201, cors);
}

async function initializeProject(env, name, body, cors) {
  const pin = String(body?.pin || "").trim();
  if (!PIN_RE.test(pin)) return json({ error: "PIN must contain exactly 4 digits" }, 400, cors);
  const page = await findProject(env, name);
  if (!page) return json({ error: "Project not found" }, 404, cors);
  const current = readJson(page.properties["Project JSON"]);
  if (current && current._auth && current.data) return json({ error: "Project is already initialized" }, 409, cors);

  const wrapped = await wrapProject(pin, body.project || defaultProject(name));
  await writeWrapped(env, page.id, wrapped);
  return json({ ok: true, name, project: wrapped.data }, 200, cors);
}

async function getProject(env, name, pin, cors) {
  const page = await findProject(env, name);
  if (!page) return json({ error: "Project not found" }, 404, cors);
  const wrapped = readJson(page.properties["Project JSON"]);
  if (!(wrapped && wrapped._auth && wrapped.data)) return json({ error: "Project is not initialized" }, 409, cors);
  if (!(await verifyPin(pin, wrapped._auth))) return json({ error: "Incorrect project PIN" }, 401, cors);
  return json({ id: page.id, name, project: wrapped.data }, 200, cors);
}

async function updateProject(env, name, pin, projectData, cors) {
  const page = await findProject(env, name);
  if (!page) return json({ error: "Project not found" }, 404, cors);
  const wrapped = readJson(page.properties["Project JSON"]);
  if (!(wrapped && wrapped._auth && wrapped.data)) return json({ error: "Project is not initialized" }, 409, cors);
  if (!(await verifyPin(pin, wrapped._auth))) return json({ error: "Incorrect project PIN" }, 401, cors);
  wrapped.data = projectData;
  await writeWrapped(env, page.id, wrapped);
  return json({ ok: true, name, project: wrapped.data }, 200, cors);
}

async function writeWrapped(env, pageId, wrapped) {
  await notionRequest(env, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { "Project JSON": { rich_text: richTextChunks(JSON.stringify(wrapped)) } } })
  });
}

async function findProject(env, name) {
  const data = await notionRequest(env, `/data_sources/${env.NOTION_DATABASE_ID}/query`, {
    method: "POST",
    body: JSON.stringify({ filter: { property: "Name", title: { equals: name } }, page_size: 1 })
  });
  return data.results[0] || null;
}

function defaultProject(name) {
  return {
    name,
    timezone: "Europe/Paris",
    startDate: "",
    endDate: "",
    slotMinutes: 60,
    dayStart: "09:00",
    dayEnd: "18:00",
    includeWeekends: false,
    people: [],
    hiddenPeople: [],
    unavailable: {}
  };
}

async function wrapProject(pin, data) {
  const salt = randomHex(16);
  return { _auth: { salt, hash: await sha256(`${salt}:${pin}`) }, data };
}

async function verifyPin(pin, auth) {
  if (!PIN_RE.test(String(pin || ""))) return false;
  return timingSafeEqual(await sha256(`${auth.salt}:${pin}`), auth.hash);
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function richTextChunks(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 1900) {
    out.push({ type: "text", text: { content: text.slice(i, i + 1900) } });
  }
  return out.length ? out : [{ type: "text", text: { content: "" } }];
}

function readTitle(property) {
  if (!property?.title?.length) return "";
  return property.title.map(x => x.plain_text || "").join("");
}

function readJson(property) {
  if (!property?.rich_text?.length) return null;
  const text = property.rich_text.map(x => x.plain_text || "").join("");
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors }
  });
}
