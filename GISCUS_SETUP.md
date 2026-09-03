# One-time giscus activation

The Team Scheduler UI is already wired to giscus. giscus is open source, free, has no ads/tracking, uses no separate database, and stores the conversation in GitHub Discussions.

At the moment, GitHub Discussions is disabled for `emaksimo/team_scheduler`, so GitHub cannot provide the required Discussion category ID yet.

## Activate it

1. Open the repository on GitHub: `emaksimo/team_scheduler`.
2. Go to **Settings → General → Features** and enable **Discussions**.
3. Install the **giscus** GitHub App for this repository only: https://github.com/apps/giscus
4. Open https://giscus.app/ and enter `emaksimo/team_scheduler`.
5. Choose the **General** discussion category.
6. In the generated script, copy the value of `data-category-id` (it starts with `DIC_`).
7. Open `index.html` and find:

   ```js
   categoryId: "",
   ```

   Paste the ID, for example:

   ```js
   categoryId: "DIC_xxxxxxxxxxxxx",
   ```

8. Commit `index.html` to GitHub. The public Feedback & questions panel will then work immediately.

## How messages are organized

This project uses one shared giscus discussion with the term:

`Team Scheduler Feedback & Questions`

All public feedback from the welcome page and calendar page goes to the same GitHub Discussion thread.
