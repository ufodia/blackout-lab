import './style.css';
import {
  createHtmlReport,
  escapeHtml,
  isPngDataUrl,
  unsuccessful,
  type Inspection,
  type Rehearsal,
  type Service,
  type Snapshot,
} from './report';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Blackout Lab application root is missing.');
const h = escapeHtml;
let targetUrl = `${location.origin}/demo`;
let inspection: Inspection | null = null;
let rehearsal: Rehearsal | null = null;
let blocked = new Set<string>();
let busy: 'inspect' | 'rehearse' | null = null;
let message =
  'Start with your own test URL, or inspect the local demo to see a real dependency fail.';
let messageKind: 'info' | 'success' | 'error' = 'info';
let browserHealth: 'checking' | 'ready' | 'unavailable' = 'checking';
let expanded: 'baseline' | 'experiment' | 'inspection' | null = null;
let reportCreatedAt = '';

function icon(name: string): string {
  const paths: Record<string, string> = {
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
    scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
    coffee:
      '<path d="M4 7h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm13 1h2a3 3 0 0 1 0 6h-2M7 2v2m4-2v2m4-2v2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    shield: '<path d="m12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    terminal: '<path d="m5 7 5 5-5 5m8 0h6"/>',
    reset: '<path d="M3 9a9 9 0 1 1 0 7M3 3v6h6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}

function tell(text: string, kind: typeof messageKind = 'info'): void {
  message = text;
  messageKind = kind;
}
function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}
function validatedUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a complete URL, starting with http:// or https://.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  return url.href;
}
function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Snapshot>;
  return (
    typeof data.title === 'string' &&
    (data.status === null || Number.isFinite(data.status)) &&
    typeof data.screenshot === 'string' &&
    Array.isArray(data.requests) &&
    data.requests.every(
      (request) =>
        request &&
        typeof request.origin === 'string' &&
        typeof request.path === 'string' &&
        typeof request.type === 'string' &&
        (request.status === null || Number.isFinite(request.status)) &&
        typeof request.failed === 'boolean',
    ) &&
    Array.isArray(data.errors) &&
    data.errors.every((error) => typeof error === 'string')
  );
}
function isService(value: unknown): value is Service {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Service>;
  return (
    typeof data.origin === 'string' &&
    typeof data.hostname === 'string' &&
    Number.isInteger(data.requestCount) &&
    data.requestCount! >= 0 &&
    Array.isArray(data.resourceTypes) &&
    data.resourceTypes.every((type) => typeof type === 'string') &&
    typeof data.firstParty === 'boolean'
  );
}
async function post(endpoint: string, payload: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Blackout-Lab': '1' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The local server took too long. Try a simpler page or check its terminal output.'
        : 'Could not reach the local test server. Make sure Blackout Lab is running, then try again.',
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('The local server returned an unreadable response. Check its terminal output.');
  }
  if (!response.ok)
    throw new Error(
      typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `The test server returned HTTP ${response.status}.`,
    );
  return data;
}
function download(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filePrefix(): string {
  let hostname = 'target';
  try {
    hostname = new URL(rehearsal?.targetUrl || targetUrl).hostname.replace(/[^a-z0-9.-]/gi, '-');
  } catch {
    /* Keep the safe default. */
  }
  return `blackout-lab-${hostname}-${reportCreatedAt.slice(0, 10)}`;
}

function emptyDiagram(): string {
  return `<div class="empty-diagram" aria-hidden="true"><div class="map-center">${icon('globe')}<span>YOUR APP</span></div><div class="map-wire wire-a"></div><div class="map-wire wire-b"></div><div class="map-wire wire-c"></div><div class="map-node node-a"><i></i><span>FONTS / CDN</span></div><div class="map-node node-b"><i></i><span>MAPS / API</span></div><div class="map-node node-c"><i></i><span>SCRIPTS / ASSETS</span></div><span class="map-caption">ILLUSTRATIVE DEPENDENCY MAP · NOT A TEST RESULT</span></div>`;
}
function serviceCards(): string {
  if (!inspection)
    return `<div class="services-empty"><div class="empty-icon">${icon('scan')}</div><h3>Meet your dependencies.</h3><p>Inspect a page to see the origins it contacts during a fresh browser load.</p><span class="empty-coordinate">NO ORIGINS DISCOVERED YET</span></div>`;
  if (!inspection.services.length)
    return '<p class="empty-note">No request origins were captured. Check the page response and try another screen.</p>';
  return inspection.services
    .map((service) => {
      const off = blocked.has(service.origin);
      return `<label class="service-card ${service.firstParty ? 'first-party' : ''} ${off ? 'is-blocked' : ''}"><span class="service-top"><span class="service-symbol">${icon(service.firstParty ? 'globe' : 'bolt')}</span><span class="service-title"><strong>${h(service.hostname)}</strong><small title="${h(service.origin)}">${h(service.origin)}</small></span><input type="checkbox" data-service-origin="${h(service.origin)}" aria-label="Block ${h(service.origin)}" ${off ? 'checked' : ''} ${service.firstParty || busy ? 'disabled' : ''}></span><span class="service-bottom"><span>${service.requestCount} request${service.requestCount === 1 ? '' : 's'}</span><span class="service-badge ${off ? 'badge-off' : ''}">${service.firstParty ? 'TARGET · KEPT ON' : off ? 'WILL BLOCK' : 'AVAILABLE'}</span></span><span class="resource-tags">${service.resourceTypes.map((type) => `<span>${h(type)}</span>`).join('')}</span></label>`;
    })
    .join('');
}
function screenshotCard(
  snapshot: Snapshot | null,
  type: 'baseline' | 'experiment' | 'inspection',
): string {
  const experiment = type === 'experiment';
  const title = experiment
    ? 'Selected origins blocked'
    : type === 'inspection'
      ? 'Inspection capture'
      : 'Normal network';
  const label = experiment
    ? '02 / EXPERIMENT'
    : type === 'inspection'
      ? '01 / DISCOVERY'
      : '01 / BASELINE';
  return `<article class="capture-card ${experiment ? 'experiment-card' : ''}"><div class="capture-heading"><span class="frame-label"><i></i>${label}</span>${snapshot ? `<button class="icon-button" data-action="expand" data-frame="${type}" aria-label="Expand ${type} screenshot">${icon('expand')}</button>` : '<span class="frame-waiting">WAITING</span>'}</div><div class="capture-window"><div class="browser-chrome"><i></i><i></i><i></i><span>${snapshot ? h(new URL(inspection?.targetUrl || targetUrl).hostname) : 'fresh browser session'}</span></div>${snapshot && isPngDataUrl(snapshot.screenshot) ? `<img data-testid="${experiment ? 'experiment-image' : 'baseline-image'}" class="capture-image" src="${snapshot.screenshot}" alt="${experiment ? 'Experiment screenshot with selected origins blocked' : type === 'inspection' ? 'Inspection screenshot from a fresh browser load' : 'Baseline screenshot under normal network conditions'}">` : `<div class="capture-placeholder"><span class="placeholder-cross">${icon(experiment ? 'bolt' : 'scan')}</span><strong>${experiment ? 'A controlled outage.' : 'A clean starting point.'}</strong><p>${snapshot ? 'Screenshot unavailable in this capture.' : experiment ? 'The second capture will block your selected origins.' : 'The first capture will load the target normally.'}</p></div>`}</div><div class="capture-caption"><strong>${title}</strong><span>${snapshot ? `HTTP ${snapshot.status ?? '—'} · ${snapshot.requests.length} requests` : 'No capture yet'}</span></div>${snapshot ? `<p class="capture-document-title">${h(snapshot.title || 'Untitled document')}</p>` : ''}</article>`;
}
function runSummary(): string {
  if (!rehearsal)
    return `<div class="observations-empty" data-testid="run-summary"><span class="terminal-prompt">&gt;_</span><p>${inspection ? 'Choose an external origin, then run a rehearsal to compare two fresh captures.' : 'Real observations will appear here after your first rehearsal.'}</p><span>NO RUN RECORDED</span></div>`;
  const after = rehearsal.experiment.requests.filter(unsuccessful);
  const before = rehearsal.baseline.requests.filter(unsuccessful);
  const deliberate = rehearsal.experiment.requests.filter(
    (request) => request.failed && rehearsal!.blockedOrigins.includes(request.origin),
  ).length;
  const errors = rehearsal.experiment.errors;
  return `<div data-testid="run-summary" class="observations"><div class="observation-header"><div><p class="eyebrow">OBSERVED IMPACT</p><h3>The capture tells a story.</h3></div><span class="measured-time">${icon('terminal')} ${seconds(rehearsal.elapsedMs)} measured</span></div><div class="metric-grid"><div class="metric"><span>ORIGINS SWITCHED OFF</span><strong>${rehearsal.blockedOrigins.length.toString().padStart(2, '0')}</strong><small>Explicit experiment controls</small></div><div class="metric"><span>DELIBERATELY BLOCKED</span><strong>${deliberate.toString().padStart(2, '0')}</strong><small>Failed requests to chosen origins</small></div><div class="metric"><span>UNSUCCESSFUL REQUESTS</span><strong>${before.length}<i>→</i>${after.length}</strong><small>Baseline → experiment</small></div><div class="metric"><span>EXPERIMENT CAPTURE NOTES</span><strong>${errors.length.toString().padStart(2, '0')}</strong><small>Errors and observation limits</small></div></div><details class="observation-details" ${after.length || errors.length ? 'open' : ''}><summary>Request and page observations <span>${after.length + errors.length}</span></summary><div class="request-table-wrap"><table><thead><tr><th>ORIGIN / PATH</th><th>TYPE</th><th>RESULT</th></tr></thead><tbody>${after.map((request) => `<tr><td><strong>${h(request.origin)}</strong><span>${h(request.path)}</span></td><td>${h(request.type)}</td><td><span class="request-result">${request.failed ? 'FAILED' : `HTTP ${request.status}`}</span></td></tr>`).join('') || '<tr><td colspan="3" class="no-requests">No unsuccessful requests observed in the experiment.</td></tr>'}</tbody></table></div>${errors.length ? `<div class="page-errors"><h4>CAPTURE NOTES</h4><ul>${errors.map((error) => `<li>${h(error)}</li>`).join('')}</ul></div>` : ''}</details><div class="run-provenance"><span>Report created ${h(new Date(reportCreatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }))}</span><span>Two fresh sessions · one captured page load each</span></div></div>`;
}

function render(): void {
  const baseline = rehearsal?.baseline || inspection?.snapshot || null;
  const selected = blocked.size;
  const services = inspection?.services.filter((service) => !service.firstParty).length || 0;
  const currentSnapshot =
    expanded === 'experiment'
      ? rehearsal?.experiment
      : expanded === 'baseline'
        ? rehearsal?.baseline
        : inspection?.snapshot;
  root!.innerHTML = `<header class="site-header"><a class="brand" href="./" aria-label="Blackout Lab home"><span class="brand-symbol">${icon('bolt')}</span><span>blackout<span class="brand-lab">lab</span><sup>↗</sup></span></a><span class="header-divider"></span><span class="header-caption">DEPENDENCY REHEARSAL<br><b>BREAK IT HERE. LEARN FROM IT.</b></span><div class="header-right"><span class="browser-health ${browserHealth}"><i></i>${browserHealth === 'checking' ? 'Checking test browser' : browserHealth === 'ready' ? 'Test browser ready' : 'Test browser unavailable'}</span><a class="support-link" href="https://buymeacoffee.com/ufodia" target="_blank" rel="noopener noreferrer">${icon('coffee')}<span>Keep the lab running</span></a></div></header>
  <main><section class="intro"><div><p class="eyebrow"><span class="amber-dot"></span> CONTROLLED OUTAGES. USEFUL ANSWERS.</p><h1>Pull the plug.<br><span>Watch what survives.</span></h1><p class="intro-description">Find out what your page depends on — then take a dependency away.</p></div><div class="intro-aside"><span class="circuit-mark" aria-hidden="true"><i></i><i></i><i></i></span><p>A small rehearsal<br>for a very real outage.</p><span>LOCAL-FIRST / OPEN SOURCE</span></div></section>
  <section class="target-panel" aria-label="Test target"><div class="target-label"><span class="section-number">01</span><label for="target-url">Choose the page to rehearse</label><button class="text-button" data-action="demo" ${busy ? 'disabled' : ''}>Use demo ${icon('reset')}</button></div><form id="target-form" class="target-form"><div class="url-field">${icon('globe')}<input id="target-url" aria-label="Target URL" type="url" value="${h(targetUrl)}" placeholder="https://your-test-app.example" required autocomplete="url" spellcheck="false" ${busy ? 'disabled' : ''}><span class="url-protocol">HTTP / HTTPS</span></div><button class="button amber" type="submit" ${busy ? 'disabled' : ''}>${busy === 'inspect' ? '<span class="spinner"></span> Inspecting…' : `${icon('scan')} Inspect target`}</button></form><div class="target-disclosure">${icon('shield')}<p>Use on apps you own or have permission to test. Each capture starts fresh; your existing browser login and cookies are not copied.</p></div></section>
  <div class="status-bar ${messageKind}" role="status" aria-live="polite"><i></i><span>${h(message)}</span>${busy ? '<span class="status-working">BROWSER AT WORK<span>•••</span></span>' : ''}</div>
  <div class="lab-layout"><aside class="dependency-panel"><div class="panel-heading"><div><p class="eyebrow">02 / SET THE CONDITIONS</p><h2>Switchboard</h2></div><span class="origin-count">${inspection ? inspection.services.length.toString().padStart(2, '0') : '—'}</span></div><p class="panel-description">Choose which external origins to switch off. The target origin stays on.</p><div class="service-list" data-testid="service-list">${serviceCards()}</div>${inspection ? `<div class="selection-caption"><span><i></i>${selected} of ${services} external origins selected</span>${inspection.elapsedMs !== undefined ? `<span>Discovery ${seconds(inspection.elapsedMs)}</span>` : ''}</div>` : ''}<button class="button amber run-button" data-action="run" ${busy || !inspection || !selected ? 'disabled' : ''}>${busy === 'rehearse' ? '<span class="spinner"></span> Rehearsing…' : `${icon('bolt')} Run rehearsal ${icon('arrow')}`}</button><p class="switchboard-note">${inspection && !services ? 'No external origins were observed on this page load. The demo includes one you can switch off.' : 'A rehearsal captures the normal page, then opens it again with your selection blocked.'}</p></aside>
  <section class="results-panel" aria-label="Rehearsal captures"><div class="results-header"><div><p class="eyebrow">03 / SEE THE DIFFERENCE</p><h2>Same page. Different conditions.</h2></div><span class="capture-state ${rehearsal ? 'has-run' : ''}"><i></i>${rehearsal ? 'REAL CAPTURES' : inspection ? 'DISCOVERY COMPLETE' : 'AWAITING DISCOVERY'}</span></div>${!inspection ? emptyDiagram() : `<div class="capture-grid">${screenshotCard(baseline, rehearsal ? 'baseline' : 'inspection')}${screenshotCard(rehearsal?.experiment || null, 'experiment')}</div>`}${runSummary()}<div class="report-bar"><div>${icon('download')}<span>Keep the evidence.<small>Standalone HTML with embedded captures, or the complete JSON observation.</small></span></div><button class="button subtle" data-action="json" ${!rehearsal || busy ? 'disabled' : ''}>Save JSON</button><button class="button outline" data-action="html" ${!rehearsal || busy ? 'disabled' : ''}>Save HTML report ${icon('arrow')}</button></div></section></div>
  <section class="scope-note"><span class="scope-index">SCOPE / NOT A CERTIFICATE</span><p>These observations cover one captured page load per condition. They do not exercise every interaction, retry, login flow, websocket or dependency path. Compare the evidence, then investigate the behavior that matters to your app.</p></section><footer class="site-footer"><span><i></i> A quiet place to make things fail.</span><span>MIT © ufodia <a href="https://github.com/ufodia/blackout-lab" target="_blank" rel="noopener noreferrer">View source ↗</a></span></footer></main>
  <dialog id="capture-dialog" aria-labelledby="capture-dialog-title"><div class="dialog-header"><h2 id="capture-dialog-title">${h(expanded || 'Capture')} screenshot</h2><button class="icon-button" data-action="close-image" aria-label="Close image">${icon('close')}</button></div>${currentSnapshot && isPngDataUrl(currentSnapshot.screenshot) ? `<img src="${currentSnapshot.screenshot}" alt="Expanded ${h(expanded || '')} capture">` : '<p>Screenshot unavailable.</p>'}</dialog>`;
  bindEvents();
  if (expanded) {
    const dialog = document.getElementById('capture-dialog') as HTMLDialogElement;
    dialog.showModal();
  }
}

async function inspectTarget(): Promise<void> {
  if (busy) return;
  try {
    targetUrl = validatedUrl(targetUrl);
  } catch (error) {
    tell(error instanceof Error ? error.message : 'Check the target URL.', 'error');
    render();
    return;
  }
  busy = 'inspect';
  inspection = null;
  rehearsal = null;
  blocked.clear();
  expanded = null;
  tell('Opening a fresh browser to discover this page’s request origins.');
  render();
  try {
    const raw = await post('/api/inspect', { url: targetUrl });
    const value = raw as Partial<Inspection> | null;
    if (
      !value ||
      typeof value.targetUrl !== 'string' ||
      !Array.isArray(value.services) ||
      !value.services.every(isService) ||
      !isSnapshot(value.snapshot) ||
      !Number.isFinite(value.elapsedMs)
    )
      throw new Error('The inspection response did not match the expected format.');
    validatedUrl(value.targetUrl);
    inspection = value as Inspection;
    browserHealth = 'ready';
    const external = inspection.services.filter((service) => !service.firstParty).length;
    tell(
      `${inspection.services.length} origin${inspection.services.length === 1 ? '' : 's'} observed in ${seconds(inspection.elapsedMs)}. ${external ? 'Select an external origin to rehearse an outage.' : 'No external origins were observed in this page load.'}`,
      'success',
    );
  } catch (error) {
    tell(error instanceof Error ? error.message : 'Could not inspect this target.', 'error');
  } finally {
    busy = null;
    render();
  }
}
async function runRehearsal(): Promise<void> {
  if (busy || !inspection || !blocked.size) return;
  busy = 'rehearse';
  rehearsal = null;
  expanded = null;
  tell('Capturing the normal page, then capturing it with your selected origins blocked.');
  render();
  try {
    const raw = await post('/api/rehearse', { url: targetUrl, blockedOrigins: [...blocked] });
    const value = raw as Partial<Rehearsal> | null;
    if (
      !value ||
      typeof value.targetUrl !== 'string' ||
      !Array.isArray(value.blockedOrigins) ||
      !value.blockedOrigins.every((origin) => typeof origin === 'string') ||
      !isSnapshot(value.baseline) ||
      !isSnapshot(value.experiment) ||
      !Array.isArray(value.services) ||
      !value.services.every(isService) ||
      !Number.isFinite(value.elapsedMs)
    )
      throw new Error('The rehearsal response did not match the expected format.');
    validatedUrl(value.targetUrl);
    rehearsal = value as Rehearsal;
    reportCreatedAt = new Date().toISOString();
    tell(
      `Two real captures completed in ${seconds(rehearsal.elapsedMs)}. Review the visual changes and request observations.`,
      'success',
    );
  } catch (error) {
    tell(error instanceof Error ? error.message : 'Could not complete this rehearsal.', 'error');
  } finally {
    busy = null;
    render();
  }
}
function invalidateTarget(value: string): void {
  targetUrl = value;
  if (!inspection && !rehearsal && !blocked.size) return;
  inspection = null;
  rehearsal = null;
  blocked.clear();
  reportCreatedAt = '';
  tell('Target changed. Inspect it again before running or saving a report.');
  const input = document.getElementById('target-url') as HTMLInputElement;
  const position = input.selectionStart;
  render();
  const nextInput = document.getElementById('target-url') as HTMLInputElement;
  nextInput.focus();
  try {
    nextInput.setSelectionRange(position, position);
  } catch {
    /* URL inputs do not support selection ranges in every browser. */
  }
}

function bindEvents(): void {
  (document.getElementById('target-form') as HTMLFormElement).onsubmit = (event) => {
    event.preventDefault();
    void inspectTarget();
  };
  (document.getElementById('target-url') as HTMLInputElement).oninput = (event) =>
    invalidateTarget((event.target as HTMLInputElement).value);
  root!.onclick = (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'demo') {
      targetUrl = `${location.origin}/demo`;
      inspection = null;
      rehearsal = null;
      blocked.clear();
      expanded = null;
      reportCreatedAt = '';
      tell(
        'Local demo selected. Inspect it, then block its external fixture origin to see a real change.',
      );
      render();
    }
    if (action === 'run') void runRehearsal();
    if (action === 'expand') {
      expanded = button.dataset.frame as typeof expanded;
      render();
    }
    if (action === 'close-image') {
      expanded = null;
      (document.getElementById('capture-dialog') as HTMLDialogElement).close();
    }
    if (action === 'html' && rehearsal) {
      download(createHtmlReport(rehearsal, reportCreatedAt), `${filePrefix()}.html`, 'text/html');
      tell('Standalone HTML report downloaded with embedded screenshots.', 'success');
      render();
    }
    if (action === 'json' && rehearsal) {
      download(
        JSON.stringify({ ...rehearsal, reportCreatedAt, reportVersion: 1 }, null, 2),
        `${filePrefix()}.json`,
        'application/json',
      );
      tell('JSON observations downloaded.', 'success');
      render();
    }
  };
  root!.onchange = (event) => {
    const input = event.target as HTMLInputElement;
    const origin = input.dataset.serviceOrigin;
    if (
      !origin ||
      !inspection ||
      busy ||
      inspection.services.find((service) => service.origin === origin)?.firstParty
    )
      return;
    if (input.checked) blocked.add(origin);
    else blocked.delete(origin);
    rehearsal = null;
    expanded = null;
    reportCreatedAt = '';
    tell(
      blocked.size
        ? `${blocked.size} external origin${blocked.size === 1 ? '' : 's'} selected. Run a fresh rehearsal to observe their impact.`
        : 'Choose an external origin to switch off.',
    );
    render();
  };
  const dialog = document.getElementById('capture-dialog') as HTMLDialogElement;
  dialog.addEventListener('close', () => {
    expanded = null;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      expanded = null;
      dialog.close();
    }
  });
}

render();
void fetch('/api/health')
  .then(async (response) => {
    const data = (await response.json()) as { ok?: boolean; browserReady?: boolean };
    browserHealth = response.ok && data.ok && data.browserReady ? 'ready' : 'unavailable';
    if (browserHealth === 'unavailable')
      tell(
        'The test browser is not ready. Check the setup guide and local server before inspecting a target.',
        'error',
      );
    render();
  })
  .catch(() => {
    browserHealth = 'unavailable';
    tell(
      'The local test server is not reachable. Start Blackout Lab using the setup guide.',
      'error',
    );
    render();
  });
