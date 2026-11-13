export interface RequestObservation {
  origin: string;
  path: string;
  type: string;
  status: number | null;
  failed: boolean;
}

export interface Snapshot {
  title: string;
  status: number | null;
  screenshot: string;
  requests: RequestObservation[];
  errors: string[];
}

export interface Service {
  origin: string;
  hostname: string;
  requestCount: number;
  resourceTypes: string[];
  firstParty: boolean;
}

export interface Inspection {
  targetUrl: string;
  services: Service[];
  snapshot: Snapshot;
  elapsedMs: number;
}

export interface Rehearsal {
  targetUrl: string;
  blockedOrigins: string[];
  baseline: Snapshot;
  experiment: Snapshot;
  services: Service[];
  elapsedMs: number;
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

export function isPngDataUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40 * 1024 * 1024) return false;
  return /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value);
}

export function unsuccessful(request: RequestObservation): boolean {
  return request.failed || (request.status !== null && request.status >= 400);
}

/** A report is static HTML; target-controlled strings never become markup or scripts. */
export function createHtmlReport(run: Rehearsal, createdAt: string): string {
  const h = escapeHtml;
  const failures = run.experiment.requests.filter(unsuccessful);
  const beforeFailures = run.baseline.requests.filter(unsuccessful).length;
  const frame = (snapshot: Snapshot, name: string): string =>
    `<section class="frame"><header><h2>${h(name)}</h2><span>Document response: ${snapshot.status ?? 'not received'}</span></header>${isPngDataUrl(snapshot.screenshot) ? `<img src="${snapshot.screenshot}" alt="${h(name)} screenshot">` : '<p class="note">Screenshot unavailable or rejected because it was not an embedded PNG.</p>'}<p>${h(snapshot.title || 'Untitled document')}</p></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Blackout Lab · Rehearsal report</title><style>
  :root{color-scheme:light;font-family:system-ui,sans-serif;color:#183047;background:#f4f5f5}*{box-sizing:border-box}body{max-width:1280px;padding:42px;margin:auto}h1{font-size:42px;letter-spacing:-2px;margin:12px 0}h2{font-size:17px;margin:0}h3{font-size:16px;margin:24px 0 12px}.eyebrow{font:11px monospace;letter-spacing:2px;color:#60778a}.target{font:13px monospace;overflow-wrap:anywhere}.meta,.note{font-size:12px;line-height:1.8;color:#647888}.metrics{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0}.metric{background:white;border:1px solid #dce3e7;padding:18px;min-width:170px;flex:1}.metric strong{display:block;font-size:28px;margin:6px 0}.metric span{font-size:12px;color:#647888}.frames{display:grid;grid-template-columns:1fr 1fr;gap:18px}.frame{background:white;border:1px solid #dce3e7;overflow:hidden}.frame header{padding:16px;border-bottom:1px solid #e5e9ec}.frame header span{font:11px monospace;display:block;margin-top:7px;color:#647888}.frame img{display:block;width:100%;height:auto}.frame p{font-size:12px;padding:0 16px;overflow-wrap:anywhere}ul{padding-left:20px;font-size:13px;line-height:1.9;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}td,th{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #dce3e7;overflow-wrap:anywhere}th{font:11px monospace;color:#647888;background:#eaf0f2}th:first-child{width:60%}.foot{padding-top:24px;margin-top:24px;border-top:1px solid #dce3e7;font-size:12px;line-height:1.8;color:#647888}a{color:#214f72}@media(max-width:760px){body{padding:22px}.frames{grid-template-columns:1fr}h1{font-size:32px}}@media print{body{padding:0;max-width:none}.frames{display:block}.frame{margin:16px 0;break-inside:avoid}table{font-size:10px}.metric{break-inside:avoid}}
  </style></head><body><p class="eyebrow">BLACKOUT LAB / LOCAL REHEARSAL REPORT</p><h1>What changed when the lights went out.</h1><p class="target">${h(run.targetUrl)}</p><p class="meta">Report created: ${h(createdAt)} · Measured server run: ${(run.elapsedMs / 1000).toFixed(2)} seconds · Each capture opened a fresh browser session.</p><div class="metrics"><div class="metric"><span>Origins deliberately blocked</span><strong>${run.blockedOrigins.length}</strong></div><div class="metric"><span>Unsuccessful baseline requests</span><strong>${beforeFailures}</strong></div><div class="metric"><span>Unsuccessful experiment requests</span><strong>${failures.length}</strong></div><div class="metric"><span>Experiment capture notes</span><strong>${run.experiment.errors.length}</strong></div></div><h3>Experiment controls</h3><ul>${run.blockedOrigins.map((origin) => `<li>${h(origin)}</li>`).join('') || '<li>No origins selected.</li>'}</ul><div class="frames">${frame(run.baseline, 'Baseline · normal network')}${frame(run.experiment, 'Experiment · selected origins blocked')}</div><h3>Unsuccessful experiment requests</h3><table><thead><tr><th>Origin / path</th><th>Resource</th><th>Result</th></tr></thead><tbody>${failures.map((request) => `<tr><td>${h(request.origin)}<br>${h(request.path)}</td><td>${h(request.type)}</td><td>${request.failed ? 'Request failed' : `HTTP ${request.status}`}</td></tr>`).join('') || '<tr><td colspan="3">No unsuccessful requests were observed in this capture.</td></tr>'}</tbody></table><h3>Baseline capture notes</h3><ul>${run.baseline.errors.map((error) => `<li>${h(error)}</li>`).join('') || '<li>No capture errors or limits noted.</li>'}</ul><h3>Experiment capture notes</h3><ul>${run.experiment.errors.map((error) => `<li>${h(error)}</li>`).join('') || '<li>No capture errors or limits noted.</li>'}</ul><p class="foot">This report covers the captured page load and selected blocked origins. It does not exercise every interaction, retry, login flow, websocket or dependency path, and it is not a resilience certification. Browser timing and live target changes can affect comparisons.<br>Blackout Lab · MIT © ufodia · <a href="https://github.com/ufodia/blackout-lab" rel="noreferrer">Source</a> · <a href="https://buymeacoffee.com/ufodia" rel="noreferrer">Support independent maintenance</a></p></body></html>`;
}
