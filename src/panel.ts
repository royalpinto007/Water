import { ScanResult } from "./parse";
import {
  Footprint,
  WATER_COEFFICIENTS,
  REASONING_MULTIPLIER,
  fmtWater,
  fmtEnergy,
  waterComparison,
} from "./water";
import { short, fmtTokens } from "./card";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Log-scaled position (%) of a value on the 0.3 mL .. 519 mL honest bar.
function barPos(ml: number): number {
  const lo = Math.log10(WATER_COEFFICIENTS.googleMlPerPrompt); // ~0.26 mL
  const hi = Math.log10(WATER_COEFFICIENTS.ceilingMlPerPrompt); // 519 mL
  const v = Math.log10(Math.max(ml, 0.01));
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
}

export function panelHtml(
  res: ScanResult,
  fp: Footprint,
  actualTokens: number,
  cardText: string,
): string {
  const logged = res.today.total;
  const usedActual = actualTokens > 0;
  const undercountX = usedActual && logged > 0 ? Math.round(actualTokens / logged) : 0;

  const models = Object.entries(res.today.perModel)
    .sort((a, b) => b[1] - a[1])
    .map(([m, t]) => {
      const pct = res.today.total ? Math.round((t / res.today.total) * 100) : 0;
      return `<tr><td>${esc(short(m))}</td><td class="num">${fmtTokens(t)}</td><td class="num">${pct}%</td></tr>`;
    })
    .join("");

  const lowPos = barPos(fp.waterMl.low);
  const highPos = barPos(fp.waterMl.high);

  const c = WATER_COEFFICIENTS;

  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
:root{--blue:#3b82f6;--deep:#1e3a8a}
body{font:13px/1.55 var(--vscode-font-family);color:var(--vscode-foreground);margin:0;padding:20px;max-width:760px}
h1{font-size:20px;margin:0 0 2px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin:26px 0 10px}
.sub{opacity:.65;margin:0 0 18px}
.big{font-size:30px;font-weight:700;letter-spacing:-.5px}
.range{color:var(--blue);font-weight:700}
.card{border:1px solid var(--vscode-panel-border);border-radius:10px;padding:16px;margin-bottom:14px;background:var(--vscode-editor-background)}
.bar{position:relative;height:14px;border-radius:8px;margin:26px 0 8px;background:linear-gradient(90deg,#60a5fa,#1e3a8a)}
.seg{position:absolute;top:0;bottom:0;background:rgba(255,255,255,.35);border-left:2px solid #fff;border-right:2px solid #fff}
.tick{position:absolute;top:16px;font-size:10px;opacity:.6;transform:translateX(-50%)}
.pin{position:absolute;top:-20px;font-size:10px;transform:translateX(-50%);white-space:nowrap;font-weight:700}
table{width:100%;border-collapse:collapse}
td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.warn{border-color:#e3a008}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);margin-left:6px}
button{font:inherit;background:var(--blue);color:#fff;border:0;border-radius:7px;padding:8px 14px;cursor:pointer}
button:hover{opacity:.9}
.muted{opacity:.6;font-size:12px}
pre{white-space:pre-wrap;background:var(--vscode-textCodeBlock-background);padding:12px;border-radius:8px;font-size:12px}
ul{margin:6px 0;padding-left:18px}
li{margin:3px 0}
</style></head><body>

<h1>💧 Water <span class="tag">today, local only</span></h1>
<p class="sub">Estimated water footprint of your AI coding usage. No network, no telemetry.</p>

<div class="card">
  <div class="big"><span class="range">${fmtWater(fp.waterMl.low)} to ${fmtWater(fp.waterMl.high)}</span></div>
  <div class="muted">energy ${fmtEnergy(fp.energyWh.low)} to ${fmtEnergy(fp.energyWh.high)} &middot; roughly ${esc(waterComparison(fp.waterMl.high))} at the high end</div>

  <div class="bar">
    <div class="seg" style="left:${lowPos}%;width:${Math.max(1, highPos - lowPos)}%"></div>
    <div class="pin" style="left:${lowPos}%">${fmtWater(fp.waterMl.low)}</div>
    <div class="pin" style="left:${highPos}%">${fmtWater(fp.waterMl.high)}</div>
    <div class="tick" style="left:0%">0.3 mL<br>vendor-optimistic</div>
    <div class="tick" style="left:100%">519 mL<br>worst-case ceiling</div>
  </div>
</div>

<div class="card ${usedActual ? "" : "warn"}">
  <h2 style="margin-top:0">Logged vs actual tokens</h2>
  <table>
    <tr><td>Logged in JSONL (raw sum)</td><td class="num">${fmtTokens(logged)}</td></tr>
    <tr><td>Actual (from statusline / config)</td><td class="num">${usedActual ? fmtTokens(actualTokens) : "not set"}</td></tr>
    ${usedActual ? `<tr><td>Undercount factor</td><td class="num">~${undercountX}x</td></tr>` : ""}
  </table>
  <p class="muted">Raw JSONL undercounts real usage by 10-100x: it uses streaming placeholders and omits hidden thinking tokens. ${usedActual ? "The estimate above uses your actual figure." : "Set <code>water.actualTokens</code> from Claude Code's statusline to correct this; until then the estimate is a floor."}</p>
</div>

<h2>Per-model breakdown (today)</h2>
<div class="card" style="padding:4px 8px">
  <table>
    <tr><th>model</th><th class="num">tokens</th><th class="num">share</th></tr>
    ${models || `<tr><td colspan="3" class="muted" style="padding:14px">No usage logged today yet.</td></tr>`}
  </table>
</div>
<p class="muted">Reasoning-heavy models get a ${REASONING_MULTIPLIER}x multiplier on the high end: model choice is the biggest real lever on footprint. Prompt-equivalents today: ${fp.promptEquivalents} raw, ${fp.reasoningWeightedPrompts} reasoning-weighted.</p>

<h2>How the range is built (labeled constants)</h2>
<div class="card">
  <ul>
    <li><b>Optimistic:</b> Google ${c.googleMlPerPrompt} mL/prompt, Altman ~${c.altmanMlPerPrompt} mL/prompt (~0.34 Wh).</li>
    <li><b>Pessimistic:</b> UC Riverside ~${c.riversideLowMlPerPrompt}-${c.riversideHighMlPerPrompt} mL/prompt; ${c.ceilingMlPerPrompt} mL worst-case ceiling.</li>
    <li><b>Reasoning multiplier:</b> ${REASONING_MULTIPLIER}x for heavyweight models (opus, o1/o3, gpt-5, etc.).</li>
  </ul>
  <p class="muted">These estimates disagree by 1000x in the literature. That spread is the honest answer, so we show a range, never one fabricated number.</p>
</div>

<h2>Share</h2>
<div class="card">
  <button id="copy">Copy shareable card</button>
  <span class="muted" id="copied" style="margin-left:10px"></span>
  <pre id="card">${esc(cardText)}</pre>
</div>

<script>
const vscode = acquireVsCodeApi();
document.getElementById('copy').addEventListener('click', () => {
  vscode.postMessage({ type: 'copyCard' });
  document.getElementById('copied').textContent = 'Copied to clipboard';
  setTimeout(() => { document.getElementById('copied').textContent = ''; }, 2000);
});
</script>
</body></html>`;
}
