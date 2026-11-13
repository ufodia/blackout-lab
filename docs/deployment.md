# Public project site

Blackout Lab's browser-driving application runs locally. The public site explains the experiment, shows a real demo capture and provides installation commands. It does not expose the scanner API or accept target URLs.

## Build the site

```sh
npm ci
npm run build:site
```

The build copies the reviewed static files from `site/` and the workspace screenshot into `site-dist/`. It does not bundle the local server. The output is generated and ignored by Git.

## Vercel

Import this repository, use `main` as the production branch and keep the committed `vercel.json` settings. They run `npm ci`, build the static site and publish `site-dist/`. No environment variables or Chromium installation are needed for this site. Deploying `dist/` alone would omit the local application's required API.

After deployment, inspect the production page, screenshot and installation links. Confirm the Vercel source commit matches the checked GitHub `main` SHA. Keep installation commands aligned with `docs/restore.md` when dependencies change.

No hosted scanner, authentication service, analytics or remote storage is configured by the project.
