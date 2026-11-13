# Run your first blackout experiment

This guide describes Blackout Lab 0.1.0. You need the local application server running and the Playwright Chromium browser installed. Use a site you own or are authorized to test.

## Start with the included demo

1. Start the application with `npm run dev` and open the printed local address, normally `http://127.0.0.1:5173`.
2. Choose **Use demo** to select the built-in `/demo` target.
3. Choose **Inspect target** to observe its requested origins.
4. In **Switchboard**, select the external demo origin, normally `http://localhost:5173`, and choose **Run rehearsal**.
5. Inspect the before-and-after screenshots and the request outcomes.
6. Choose **Save HTML report** or **Save JSON** to keep that experiment.

The demo is served locally and gives you a repeatable target without needing an external website. Its document is served from `127.0.0.1` and its sample CSS, widget and map from `localhost` at the same port, or vice versa if you open the workspace through `localhost`. Those distinct origins demonstrate a real dependency failure.

The built-in fixture restricts browser HTTP(S) requests to those two local origins and blocks WebSockets. Attempts outside that boundary are omitted from detailed evidence and reported as a generic count. That fixture-specific restriction does not apply to an arbitrary target you enter.

## Choose a target

Enter the complete `http://` or `https://` URL in **Target URL**, then choose **Inspect target**. URLs must be at most 2,048 characters with no whitespace, control characters or embedded usernames/passwords. The test uses a new browser context, so an existing browser login does not carry over. Start with a page that loads usefully without authentication.

For your own development site, leave its local server running. A target on another local port is a different origin from the workspace, even when both use `127.0.0.1`.

Navigation executes the page's normal browser code and contacts its requested services. Blackout Lab does not click controls, submit forms or import your current browser profile.

## Observe the baseline

The inspection pass loads the target, records requests observed within a bounded window, and captures the page. Each capture uses a 1440 × 960 viewport, a navigation attempt capped at 10 seconds, and a further 1.2-second observation window. The screenshot shows the viewport, not the full scrollable document. Use the request list to identify external origins that matter to the initial view.

The target origin and its baseline redirect destination are protected. You cannot use the external-origin controls to block those origins. The application workspace and API are also excluded as test targets; use the exact `/demo` or `/demo/` route to inspect Blackout Lab itself.

An origin includes the scheme and port as well as the hostname:

| URL                               | Origin                  |
| --------------------------------- | ----------------------- |
| `https://example.test/map.js`     | `https://example.test`  |
| `http://127.0.0.1:9000/image.png` | `http://127.0.0.1:9000` |
| `http://127.0.0.1:9001/image.png` | `http://127.0.0.1:9001` |

The last two origins are independently selectable because their ports differ.

## Select and block dependencies

Select between one and 30 external origins in **Switchboard**, then choose **Run rehearsal**. A rehearsal takes a new baseline and then a new blackout capture; it does not reuse the earlier inspection screenshot. The blackout pass uses a fresh context and aborts matching HTTP(S) requests. Blocking happens inside that test browser; it does not affect your normal browser or system network configuration.

The selected origins must still appear in the rehearsal's new baseline. If a selected dependency is no longer observed, inspect the target again and choose from the current results. Changing the target clears its inspection and choices; changing the blocked-origin selection clears the previous rehearsal and disables report downloads until a new run completes.

Start with one origin so you can interpret its effect. Then try combinations if your page depends on several services for the same feature.

If a third-party response is fetched by your own backend and served from your own origin, this browser-level test cannot independently block that upstream provider. You need a different test boundary for that case.

## Compare the evidence

Inspect the screenshots together with the request log. A missing map, image or font may be visible immediately. A blocked request with no obvious screenshot difference can still matter to a later interaction that this experiment did not exercise.

Differences can also come from dynamic content, timing, animations or the page's normal variability. Repeat a controlled experiment when you need to distinguish those effects from the selected blocking rule.

Service workers are disabled for the test contexts so a cached service-worker response does not quietly defeat the experiment. This also means the result is not a test of the site's normal offline/service-worker behavior. For general targets, WebSockets are not controlled or reported.

## Export and share a report

Choose **Save HTML report** for a standalone visual report with embedded screenshots, or **Save JSON** for the complete structured observation with embedded PNG data. HTML shows unsuccessful experiment requests and capture notes; JSON includes the captured request arrays for both conditions. Use the expand control on a screenshot to inspect it at a larger size in the workspace.

Before sending a report, inspect screenshots, page titles and URL paths. The tool omits query strings, URL fragments, headers, bodies and cookies from recorded request data, but those omissions do not remove private content rendered by the page itself.

The export's **Report created** time comes from the workspace browser when the rehearsal response arrives. The backend reports measured elapsed time, not per-screenshot capture timestamps. An export records what the tool captured; it does not make an authenticated or multi-step workflow test out of a single navigation.

## Troubleshooting

| Symptom                                                    | Check                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium cannot launch                                     | Run `npx playwright install --no-shell chromium` from the project. Install using the same OS account that runs the server.                                     |
| The workspace loads but experiments fail                   | Keep the local backend running; a static file viewer cannot drive Chromium. Inspect the server's concise error.                                                |
| Your local target cannot be reached                        | Keep its server running and check the exact scheme, hostname and port from the same computer.                                                                  |
| A login page appears                                       | The test intentionally starts without your existing cookies. Choose a useful unauthenticated page.                                                             |
| No external origins appear                                 | The page may be self-contained, use same-origin proxying, or load its dependencies after the observation window or an interaction.                             |
| A service still looks available after blocking             | Check the exact origin and port; the relevant request may use another origin or may not occur during the captured navigation.                                  |
| A selected origin was not observed in the current baseline | Inspect again and select from the fresh results; dynamic pages can change their dependency set between loads.                                                  |
| The tool reports a request budget or timeout               | Each capture is limited to 500 routed requests; the operation has a 45-second limit. Reduce the page or inspect the partial evidence and its errors.           |
| Screenshot capture failed                                  | No replacement image is generated. Retry the target and check the local server/browser; that operation returns an error.                                       |
| An operation is already running                            | Wait for it to finish. The backend accepts only one inspection or rehearsal at a time.                                                                         |
| A report contains private material                         | Do not share it. Use a synthetic target or remove sensitive evidence outside the original report before distributing a copy.                                   |
| A local request is rejected                                | Open the workspace using its printed loopback address and keep frontend/backend settings aligned; do not work around the Host, Origin or custom-header checks. |

To choose another local port, run `npm run dev -- --port 5180` or `npm start -- --port 5180`. The command-line wrapper accepts `--port`; it does not accept Vite-specific flags such as `--strictPort`.

For a reproducible bug, see [CONTRIBUTING.md](../CONTRIBUTING.md).
