/*
  Team Scheduler public feedback route for the existing Cloudflare Worker.

  Cloudflare binding required:
    Type: KV Namespace
    Variable name: FEEDBACK

  Add the route hook shown at the bottom of this file near the TOP of your
  existing fetch() handler, before your /project routes.
*/

const FEEDBACK_CORS = {
  "Access-Control-Allow-Origin": "https://emaksimo.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

function feedbackJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...FEEDBACK_CORS
    }
  });
}

function cleanFeedbackText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

async function handleFeedback(request, env) {
  if (!env.FEEDBACK) {
    return feedbackJson({ error: "FEEDBACK KV binding is missing." }, 500);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: FEEDBACK_CORS });
  }

  if (request.method === "GET") {
    const messages = (await env.FEEDBACK.get("public-messages", "json")) || [];
    return feedbackJson({ messages });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return feedbackJson({ error: "Invalid JSON body." }, 400);
    }

    const name = cleanFeedbackText(body.name, 40);
    const message = cleanFeedbackText(body.message, 1000);

    if (!name) return feedbackJson({ error: "Name is required." }, 400);
    if (!message) return feedbackJson({ error: "Message is required." }, 400);

    const messages = (await env.FEEDBACK.get("public-messages", "json")) || [];

    messages.push({
      id: crypto.randomUUID(),
      name,
      message,
      createdAt: new Date().toISOString()
    });

    // Keep the public thread lightweight. Oldest entries roll off after 200.
    const trimmed = messages.slice(-200);
    await env.FEEDBACK.put("public-messages", JSON.stringify(trimmed));

    return feedbackJson({ ok: true }, 201);
  }

  return feedbackJson({ error: "Method not allowed." }, 405);
}

/*
  ROUTE HOOK — add this inside your existing Worker fetch handler:

  const url = new URL(request.url);

  if (url.pathname === "/feedback") {
    return handleFeedback(request, env);
  }

  IMPORTANT:
  Put this BEFORE generic /project routing.
*/
