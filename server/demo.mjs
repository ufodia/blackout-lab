/** A deterministic, network-independent target with one alternate local origin. */
export function demoResponse(pathname, port, host = `127.0.0.1:${port}`) {
  const dependency = host.startsWith('localhost')
    ? `http://127.0.0.1:${port}`
    : `http://localhost:${port}`;
  if (pathname === '/demo' || pathname === '/demo/')
    return {
      type: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Atlas — Field notes</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f3ee;color:#202b29;font:16px system-ui,sans-serif}header,main,footer{max-width:1120px;margin:auto}header{display:flex;justify-content:space-between;padding:35px 0;border-bottom:1px solid #c9cfca}.brand{font-size:25px;font-weight:800}main{padding:64px 0}h1{font-size:58px;line-height:1.03;letter-spacing:-3px;max-width:650px;margin:20px 0}p{line-height:1.7;color:#5d6d65}.layout{display:grid;grid-template-columns:1fr 1.25fr;gap:60px;align-items:center}.eyebrow{font-size:11px;font-weight:800;letter-spacing:3px}.map{min-height:380px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#e3e7e0;border:1px dashed #9aaba0;border-radius:18px;overflow:hidden}.map img{width:100%;min-height:250px;display:block}.map p{padding:0 20px;font-size:14px}.card{margin-top:35px;border-top:1px solid #c9cfca;padding-top:20px}footer{font-size:12px;padding:25px 0;border-top:1px solid #c9cfca}@media(max-width:800px){header,main,footer{margin:0 24px}.layout{grid-template-columns:1fr}h1{font-size:42px}}</style><link rel="stylesheet" href="${dependency}/demo-assets/style.css"><script defer src="${dependency}/demo-assets/widget.js"></script></head><body><header><span class="brand">atlas<span style="color:#738b55">.</span></span><span>Places worth finding / Issue 04</span></header><main><div class="layout"><section><span class="eyebrow">THE WEEKEND FIELD GUIDE</span><h1>A little further.<br>A little quieter.</h1><p>Find a trail, pack a notebook, and leave the week behind. Your next afternoon starts with one good place.</p><div class="card"><strong>Pine Ridge Loop</strong><p>6.4 km · Easy pace · A view worth the walk</p><span id="partner-status">Route partner is loading…</span></div></section><section class="map" aria-label="Partner trail map"><img src="${dependency}/demo-assets/map.svg" alt="Trail map supplied by the route partner"><p id="map-caption">Waiting for the route partner’s map and live trail detail.</p></section></div></main><footer>Blackout Lab fixture · This page and its alternate-origin dependencies are served entirely on your computer.</footer></body></html>`,
    };
  if (pathname === '/demo-assets/style.css')
    return {
      type: 'text/css; charset=utf-8',
      body: `.map{background:#18382d;border:0;box-shadow:0 28px 60px #173b2920}.map p{color:#c7dfba}#partner-status{display:inline-block;border-radius:20px;padding:8px 14px;background:#d8ecb8;color:#264c30;font-weight:700;font-size:12px}.brand{letter-spacing:-1px}`,
    };
  if (pathname === '/demo-assets/widget.js')
    return {
      type: 'text/javascript; charset=utf-8',
      body: `document.getElementById('partner-status').textContent='● Partner connected · 3 open trailheads';document.getElementById('map-caption').textContent='Pine Ridge · north trailhead → lookout → creek crossing';`,
    };
  if (pathname === '/demo-assets/map.svg')
    return {
      type: 'image/svg+xml; charset=utf-8',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="470" viewBox="0 0 720 470"><rect width="720" height="470" fill="#18382d"/><g fill="none" stroke="#345646" stroke-width="2"><path d="M-50 120Q160-70 330 110T770 20M-50 170Q160-20 330 160T770 70M-50 220Q160 30 330 210T770 120M-50 270Q160 80 330 260T770 170M-50 320Q160 130 330 310T770 220M-50 370Q160 180 330 360T770 270M-50 420Q160 230 330 410T770 320M-50 470Q160 280 330 460T770 370"/></g><path d="M110 360C150 300 200 350 235 265S320 260 370 190S465 225 520 120S580 140 625 75" fill="none" stroke="#cbe97e" stroke-width="8" stroke-linecap="round" stroke-dasharray="2 15"/><g fill="#cbe97e" stroke="#18382d" stroke-width="5"><circle cx="110" cy="360" r="13"/><circle cx="370" cy="190" r="13"/><circle cx="625" cy="75" r="13"/></g><g fill="#e9f0de" font-family="sans-serif" font-size="16"><text x="70" y="400">NORTH TRAILHEAD</text><text x="350" y="160">LOOKOUT</text><text x="510" y="45">CREEK CROSSING</text></g><text x="40" y="45" fill="#a2c19c" font-family="sans-serif" font-size="11" letter-spacing="3">PARTNER MAP / LIVE ROUTE</text></svg>`,
    };
  return null;
}
