TEAM SCHEDULER V12
GitHub Pages + Cloudflare Worker + Notion + per-project 4-digit PIN

FRONTEND
- index.html
- app.js
- API URL is already set to:
  https://team-scheduler-api.maksimovich-elena.workers.dev

BACKEND
- worker.js
Replace the current Cloudflare Worker code with worker.js and deploy it.
Keep the existing Cloudflare variables:
  NOTION_TOKEN         = secret Notion PAT
  NOTION_DATABASE_ID   = your working Notion data source ID

HOW PROJECT PINs WORK
- Every project has its own 4-digit PIN.
- The PIN itself is never stored in GitHub or Notion.
- The Worker stores only a salted SHA-256 hash inside that project's Notion JSON.
- The browser sends the PIN to the Worker over HTTPS.
- Authentication metadata is not returned to the browser.
- The PIN is remembered only in sessionStorage for the current browser tab/session.

FIRST-TIME BIG 12 SETUP
Your existing BIG 12 row currently has an empty Project JSON.
After deploying worker.js and the frontend:
1. Click BIG 12.
2. The app says Set project PIN.
3. Choose a 4-digit PIN.
4. BIG 12 is initialized automatically with:
   Clementine, Pascale, Johanna, Eva, Dejan, Tiphaine, Elena, EVA BS, Leonie.
5. Share the PIN only with BIG 12 members.

NEW PROJECTS
- Click + New project.
- Enter project name + 4-digit PIN.
- A new Notion row is created automatically.
- All project settings, people and availability are stored in that project's Project JSON.

GITHUB PAGES
Upload index.html and app.js to the repository root.
Settings > Pages > Deploy from branch > main > /(root).

SECURITY NOTE
A 4-digit PIN is a lightweight access gate, not strong authentication: there are only 10,000 combinations.
For a small trusted group it may be acceptable, but 6 digits or a short passphrase is safer.
For public exposure, add Cloudflare rate limiting for failed PIN attempts.
