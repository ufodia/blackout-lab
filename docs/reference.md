# Local API and evidence reference

This reference describes Blackout Lab 0.1.0. The Node server binds to 127.0.0.1, normally on port 5173. The server and capture modules define this local contract.

## Request requirements

Open the workspace through the printed local address. The backend accepts literal 127.0.0.1 and localhost Host names at its current port. A supplied Origin must match that exact host origin; cross-site browser requests are rejected.

Every API POST requires:

```text
Content-Type: application/json
X-Blackout-Lab: 1
```

The custom header is a fixed request marker, not a secret or session token. CLI clients without an Origin header can intentionally call the API with these headers. JSON bodies must be objects and fit within **16 KiB**, including streamed bodies. Keep the backend on loopback.

## Endpoints

| Method and route   | Input                                                   | Successful response                               |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------- |
| GET /api/health    | No body                                                 | An object with ok: true and browserReady: boolean |
| POST /api/inspect  | An object with url: string                              | Inspection                                        |
| POST /api/rehearse | An object with url: string and blockedOrigins: string[] | Rehearsal                                         |

The health check tests whether the expected Chromium executable is present; a later launch can still fail. The built-in fixture is served at GET /demo or /demo/, with fixed assets under /demo-assets/.

Example inspection body at the default port:

```json
{
  "url": "http://127.0.0.1:5173/demo"
}
```

Example rehearsal body:

```json
{
  "url": "http://127.0.0.1:5173/demo",
  "blockedOrigins": ["http://localhost:5173"]
}
```

An inspection uses one fresh capture. A rehearsal creates a new baseline and a new blocked capture; it does not reuse the inspection image.

## Input rules and work limits

| Value                      | Limit or behavior                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Target URL                 | Absolute HTTP(S), at most 2,048 characters; no whitespace, control characters or embedded credentials |
| Query and fragment         | Preserved for navigation; omitted from returned target URL and request evidence                       |
| Blocked origins            | 1–30 entries before deduplication; origins only, without a path beyond /, query or fragment           |
| First-party protection     | Original target origin and baseline redirect destination cannot be blocked                            |
| Selection freshness        | Every selected origin must appear in the rehearsal's new baseline                                     |
| Viewport                   | Fixed 1440 × 960 CSS pixels; device scale factor 1; viewport screenshot rather than full-page capture |
| Context                    | Fresh storage/cookies, service workers blocked, downloads disabled; no imported login state           |
| Navigation                 | Up to 10 seconds, waiting for DOM content loaded                                                      |
| Observation                | A further 1.2 seconds after the navigation attempt                                                    |
| Requests                   | Up to 500 records per capture; further routed requests are aborted and a capture note is added        |
| Operation                  | 45-second limit; one inspection/rehearsal at a time per local server                                  |
| Request path               | At most 1,000 characters in evidence                                                                  |
| Page title                 | At most 200 characters                                                                                |
| JavaScript error summaries | Up to 20 generic error-type notes; original messages omitted                                          |

An origin is scheme, hostname and effective port. Paths do not define separate origins. General-target WebSockets are not controlled or reported. Requests made by the target's own server to an upstream provider are outside this browser boundary.

The workspace/API routes cannot themselves be inspection targets. Use the exact built-in /demo route. For that fixture only, browser HTTP(S) traffic is restricted to the app's two local origins and WebSockets are blocked. Outside attempts are omitted from detailed records and summarized by a generic count.

## Response data

### Inspection

| Field     | Type      | Meaning                                              |
| --------- | --------- | ---------------------------------------------------- |
| targetUrl | string    | Target URL with query, fragment and userinfo removed |
| services  | Service[] | Origins grouped from this capture's request records  |
| snapshot  | Snapshot  | Inspection evidence                                  |
| elapsedMs | number    | Measured server operation duration in milliseconds   |

### Rehearsal

| Field          | Type      | Meaning                                             |
| -------------- | --------- | --------------------------------------------------- |
| targetUrl      | string    | Sanitized target URL                                |
| blockedOrigins | string[]  | Deduplicated origin rules applied to the experiment |
| baseline       | Snapshot  | Fresh normal-network evidence                       |
| experiment     | Snapshot  | Fresh evidence with selected origins blocked        |
| services       | Service[] | Origins grouped from the rehearsal baseline         |
| elapsedMs      | number    | Measured server duration including both captures    |

### Service

**origin** is the full origin; **hostname** is its display hostname. **requestCount** counts recorded requests for that origin, **resourceTypes** lists its distinct sorted resource types, and **firstParty** marks the original target or its baseline redirect destination.

### Snapshot

| Field      | Type                 | Meaning                                                                                              |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| title      | string               | Captured document title, possibly empty                                                              |
| status     | number or null       | Main navigation response status, or no received response                                             |
| screenshot | string               | Real PNG embedded as a data:image/png;base64 URL                                                     |
| requests   | RequestObservation[] | Bounded HTTP(S) request evidence                                                                     |
| errors     | string[]             | Capture notes: generic JavaScript errors, navigation/budget limitations or fixture-boundary attempts |

The **errors** field is shown as **Capture notes**. It is not exclusively a count of JavaScript exceptions. Navigation failure may still return a partial snapshot with notes. Screenshot failure returns HTTP 502 instead; the runner generates no replacement PNG.

### RequestObservation

Each record contains **origin**, **path**, **type**, **status** and **failed**. The path omits the query and fragment. Status is a response code or null; failed records a browser request-failure event. A null status alone is not proof of failure because a timed capture can end before a response arrives.

The workspace treats a request as **unsuccessful** when failed is true or a non-null HTTP status is at least 400. It counts failed requests to selected origins as deliberately blocked. No request headers, bodies or cookies are retained in this model.

## Error responses

Errors use JSON with one readable **error** string. Guard failures can occur before endpoint-specific method checks.

| HTTP status | Typical reason                                                       |
| ----------- | -------------------------------------------------------------------- |
| 400         | Invalid target/JSON/origin rule, protected origin or stale selection |
| 403         | Invalid Host/Origin, cross-site call or missing custom header        |
| 404         | Unknown route or missing built asset                                 |
| 405         | Unsupported method                                                   |
| 413         | Body exceeds 16 KiB or a static asset exceeds its server limit       |
| 415         | POST content type is not JSON                                        |
| 429         | Another operation is running; includes Retry-After: 3                |
| 500         | Generic local failure; internal error details omitted                |
| 502         | Screenshot capture failed; no image generated                        |
| 503         | Chromium could not launch                                            |
| 504         | Operation ended before it could finish                               |

## Downloads and timing

**Save JSON** downloads the complete Rehearsal object with two workspace-added fields: **reportVersion: 1** and **reportCreatedAt**, an ISO date string from the workspace browser when the response arrives. There is no backend capturedAt field or per-screenshot timestamp.

**Save HTML report** creates static HTML with embedded PNGs, controls, unsuccessful-request details and capture notes. Target-controlled strings are escaped. The report's content-security policy permits embedded images and inline styles, with no script execution. It includes source/support links but does not fetch target assets to reconstruct the screenshots.

Changing the target invalidates the inspection, selections and rehearsal. Changing the blocked-origin selection invalidates the rehearsal and disables downloads until a fresh run completes. Results remain in workspace memory; downloads are the durable files.

This interface belongs to the local source application. Version 0.1.0 does not promise a stable hosted API. Record the repository commit manually when comparing results across tool versions.
