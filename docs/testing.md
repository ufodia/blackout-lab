# Reproduce the verification checks

This guide describes checks for Blackout Lab 0.1.0. It does not claim coverage of every browser, site, interaction or network condition.

## Install the tracked dependencies

Use Node.js 24 LTS:

```sh
npm ci
npx playwright install --no-shell chromium
```

The project uses the full Chromium channel. Linux CI installs OS dependencies as well with `npx playwright install --with-deps --no-shell chromium`.

## Check source and build

```sh
npm run verify
```

The command combines type checking, unit tests and the production build. To inspect the built local application:

```sh
npm run build
npm start
```

Keep the local backend running. A static-file viewer does not replace the browser-driving server. The `npm run preview` command uses the same built local server as `npm start`.

## Exercise the browser workflow

```sh
npm run test:e2e
```

The tracked Playwright configuration controls the application startup and browser settings. Use the built-in local demo to reproduce dependency failure without relying on an external provider.

## Verification map

| Area      | Meaningful cases                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| URL input | HTTP(S) acceptance, malformed input rejection, userinfo rejection and origin normalization                                     |
| Blocking  | External-origin selection, port distinction and protected first-party origin                                                   |
| Runner    | Fresh contexts, service-worker blocking, bounded observation and launch/timeout errors                                         |
| Evidence  | Actual PNG captures, request failures, query/fragment removal, generic capture notes, no stored request headers/bodies/cookies |
| Local API | Loopback binding, Host/Origin checks, custom-header validation, one-operation lock and bounded input                           |
| Reports   | Escaped text, complete captured evidence and readable downloaded output                                                        |
| Workspace | Demo discovery, rule selection, comparison, download and failure feedback                                                      |

Tests should demonstrate the boundary being claimed. A screenshot comparison cannot prove that a page's checkout or authenticated state still works.

## Manual review before sharing an experiment

1. Confirm the exact target URL and the selected external origins.
2. Inspect both screenshots and the associated request outcomes.
3. Consider dynamic content and timing as alternative reasons for a visual difference.
4. Review titles, paths and screenshots for private information.
5. Record the actual source commit and viewport when comparing results over time.

Unverified scope includes authenticated user journeys, later page interactions, backend-to-provider requests, general-target WebSockets, full offline/service-worker behavior and every possible viewport or timing condition. Describe those limits with the evidence rather than labeling a site “resilient” after a successful capture.
