# Restore Blackout Lab from GitHub

The repository contains application source, non-secret configuration, the dependency lockfile, tests, the demo and documentation. Experiment reports are your local data and must be backed up separately if you need to retain them.

## Set up a replacement computer

Install Git and Node.js 24 LTS, then run:

```sh
git clone https://github.com/ufodia/blackout-lab.git
cd blackout-lab
git switch main
git pull --ff-only origin main
git rev-parse HEAD
npm ci
npx playwright install --no-shell chromium
npm run verify
npm run dev
```

Record the full commit SHA printed by `git rev-parse HEAD` when you need an exact source reference. Open the printed local workspace address and test the included `/demo` target.

To use the built local application, run `npm run build` followed by `npm start`.

## Update an existing checkout

Inspect `git status` first. Preserve local changes before pulling. With a clean checkout on `main`, update using `git pull --ff-only origin main`, then run `npm ci` and the checks again.

If the Playwright dependency changes, run its Chromium installation command again so the expected browser revision is available. Browser binaries are installed locally; they are not committed to the repository.

The restoration process does not import an everyday browser profile, authentication state, cloud credentials or a remote service account.
