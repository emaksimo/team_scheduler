# Team Scheduler — public Feedback & Questions setup

The frontend in this ZIP is already updated. It no longer uses giscus and does **not** require a GitHub account.

Feedback is stored in a small Cloudflare KV namespace through the same Cloudflare Worker used by Team Scheduler.

## 1. Create the Cloudflare KV storage

In Cloudflare:

1. Open **Workers & Pages**.
2. Open `team-scheduler-api`.
3. Open **Bindings** (depending on the Cloudflare UI this can also be under Settings > Bindings).
4. Click **Add binding**.
5. Choose **KV Namespace**.
6. Create a new namespace, for example `team-scheduler-feedback`.
7. Set the **Variable name** exactly to:

   `FEEDBACK`

8. Save the binding.

No password, API key, or database URL is required by the browser.

## 2. Update your existing Worker

Your production Worker source is not stored in the GitHub repository, so this ZIP does not replace it automatically.

Open the Worker code in Cloudflare and copy the helper code from:

`cloudflare/feedback-worker-snippet.js`

Then, inside the existing `fetch(request, env, ctx)` handler, add this route near the top, before the `/project` routes:

```js
const url = new URL(request.url);

if (url.pathname === "/feedback") {
  return handleFeedback(request, env);
}
```

If your handler already has `const url = new URL(request.url)`, do not create it twice; only add the `if` block.

Deploy the Worker.

## 3. Upload the frontend to GitHub

Replace the GitHub Pages project files with this ZIP's:

- `index.html`
- `app.js`
- `assets/`

The frontend calls your existing API:

`https://team-scheduler-api.everloop.workers.dev/feedback`

No additional frontend configuration is needed.

## 4. Test

Open Team Scheduler and expand **Feedback & questions**.

You should see:

- the public message thread;
- Name field;
- Message field;
- Post button;
- no GitHub sign-in.

Post a test message, reload the page, reopen **Feedback & questions**, and verify that the message is still visible.

## Storage and privacy

Feedback messages are stored in Cloudflare KV under the `FEEDBACK` binding, not in GitHub Discussions and not in the browser.

The current implementation stores only:

- the display name entered by the visitor;
- the message;
- a generated message ID;
- the creation timestamp.

The frontend does not ask for an email address. It renders messages as plain text, not HTML.

The public thread keeps the latest 200 messages. This limit can be changed in `feedback-worker-snippet.js`.
