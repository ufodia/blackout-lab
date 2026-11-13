# Contributing to Blackout Lab

Focused browser regressions, clearer evidence displays and better local setup instructions are welcome. Keep the initial product's boundary explicit: one page, one viewport and a timed origin-blocking experiment.

## Local setup

Use Node.js 24 LTS and the committed lockfile:

```sh
npm ci
npx playwright install --no-shell chromium
npm run dev
```

Start with the included local demo. It avoids external service variability and makes failure cases reproducible. Read [the architecture](docs/architecture.md) and [privacy contract](docs/privacy.md) before changing the runner or reports.

## Report a bug

Include the source commit, operating system, browser/tool error, exact steps and a synthetic target when possible. Explain what you expected and what happened. Review screenshots, titles and URL paths before attaching a report publicly.

Do not attach private account data or an authenticated browser profile. Follow [SECURITY.md](SECURITY.md) for vulnerabilities.

## Keep changes inspectable

- Separate browser orchestration, evidence handling and workspace presentation.
- Preserve the protected first-party origin and exact scheme/host/port semantics.
- Keep target input as parsed data; never interpolate it into a shell command.
- Preserve loopback, Host/Origin, input-size and custom-header checks.
- Escape report labels and keep recorded request data free of queries, fragments, headers, bodies and cookies.
- Add focused regression cases for behavior you change.

Do not commit browser binaries, dependency folders, generated build output, credentials or private reports. Keep dependency changes paired with the lockfile. Use original or properly licensed presentation assets.

## Verify and submit

```sh
npm run verify
npm run test:e2e
```

Describe the checks you actually ran and any limitations. Update user and interface documentation when behavior changes. Keep all project content in English.

Use the pull-request template to explain the concrete problem, resulting behavior, evidence and compatibility effects. By contributing, you agree to distribute your contribution under the repository's [MIT license](LICENSE) and to follow the [code of conduct](CODE_OF_CONDUCT.md).
