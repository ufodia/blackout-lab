# Privacy and captured data

Blackout Lab runs a local server and a local test browser. It does not upload reports to a hosted audit service or require an account.

## What the test browser accesses

The runner navigates to the target you choose. The page can make ordinary network requests while it loads. A selected blocked origin has its matching requests aborted in the blackout pass. The tool does not reuse your everyday browser's existing cookies, storage or login profile.

The built-in local demo has an additional network boundary: outside browser HTTP(S) requests and WebSockets are blocked. Their detailed origins and paths are omitted from fixture reports, which retain only a generic attempt count. Arbitrary targets do not receive that fixture allowlist; their general WebSocket traffic is not controlled or reported.

Isolation prevents profile reuse; it does not make a page's normal navigation invisible to the target server. That server and any contacted providers can observe requests in the usual way.

## What evidence keeps

Reports can include:

- Actual page screenshots.
- Page titles.
- Requested origins and URL paths.
- Request outcomes and failures.
- The selected blocking rules and experiment settings.

Recorded request URLs omit query strings and fragments. The tool does not store request headers, request bodies or cookies as report evidence.

The reported target URL also omits its query and fragment. Those components are preserved for navigation. Page JavaScript error messages are replaced by generic error-type summaries; raw error messages are not copied into the report.

## What sanitization does not remove

A page can render an email address, private document, internal hostname or token directly into its content. That content can appear in a screenshot or title. A URL path can itself contain an account ID or sensitive value. Removing a query string does not remove those other exposures.

Inspect every exported report before sharing it. Prefer the included demo or a synthetic local target for public issues and demonstrations.

## Local files and development services

Exported reports become files wherever you save them. Keep them under your own backup and retention policy; the GitHub source repository is not a backup of your experiments. Avoid committing private reports or screenshots to a public repository.

The application has no report database. Current results live in workspace memory; refreshing, changing the target, changing the selection or leaving the page can clear them. Save a report when you need to retain it.

Obtaining the source, installing packages or Chromium, and opening GitHub or Buy Me a Coffee links contacts those services. Those development and support visits are separate from local report processing.

See [SECURITY.md](../SECURITY.md) for sensitive implementation reports.
