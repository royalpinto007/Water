import * as vscode from "vscode";
import { SessionInfo } from "./parse";
import {
  footprintFromModels,
  fmtWater,
  fmtEnergy,
  isReasoningModel,
  REASONING_MULTIPLIER,
} from "./water";
import { short } from "./card";

// A compact "banner" card, meant to be docked in the right-hand secondary
// side bar next to Claude Code / Codex. Shows the current session's live
// footprint and the increment from the last message you sent.
export class BannerView implements vscode.WebviewViewProvider {
  public static readonly viewId = "water.banner";
  private view?: vscode.WebviewView;
  private session: SessionInfo | null = null;
  private tokensPerPrompt = 500;
  private actualFactor = 1;

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((m) => {
      if (m?.type === "openPanel") vscode.commands.executeCommand("water.showPanel");
    });
    this.render();
  }

  update(session: SessionInfo | null, tokensPerPrompt: number, actualFactor: number) {
    this.session = session;
    this.tokensPerPrompt = tokensPerPrompt;
    this.actualFactor = actualFactor > 0 ? actualFactor : 1;
    this.render();
  }

  private render() {
    if (!this.view) return;
    this.view.webview.html = this.html();
  }

  private html(): string {
    const s = this.session;
    if (!s || s.total === 0) {
      return this.shell(
        `<div class="empty">No active AI session yet.<br><span class="muted">Send a message in Claude Code or Codex and this updates live.</span></div>`,
      );
    }

    const sessTokens = s.total * this.actualFactor;
    const lastTokens = s.lastDelta * this.actualFactor;
    const fp = footprintFromModels({ [s.model]: sessTokens }, this.tokensPerPrompt);
    const lastFp = footprintFromModels({ [s.model]: lastTokens }, this.tokensPerPrompt);
    const heavy = isReasoningModel(s.model);

    return this.shell(`
      <div class="row">
        <span class="drop">💧</span>
        <div>
          <div class="big">${fmtWater(fp.waterMl.low)} <span class="to">to</span> ${fmtWater(fp.waterMl.high)}</div>
          <div class="muted">this session &middot; ${fmtEnergy(fp.energyWh.low)}&ndash;${fmtEnergy(fp.energyWh.high)}</div>
        </div>
      </div>

      <div class="last">
        <span class="arrow">+</span> last message:
        <b>${fmtWater(lastFp.waterMl.low)}&ndash;${fmtWater(lastFp.waterMl.high)}</b>
      </div>

      <div class="meta">
        <span class="tag ${heavy ? "hot" : ""}">${short(s.model)}${heavy ? ` &middot; ${REASONING_MULTIPLIER}x` : ""}</span>
        <span class="muted">${s.messages} msgs &middot; ${fmtTokens(sessTokens)} tok${this.actualFactor !== 1 ? " (actual)" : " (logged)"}</span>
      </div>

      <button id="more">Details &amp; shareable card</button>
    `);
  }

  private shell(inner: string): string {
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
body{font:12px/1.5 var(--vscode-font-family);color:var(--vscode-foreground);margin:0;padding:12px}
.row{display:flex;align-items:center;gap:10px}
.drop{font-size:22px}
.big{font-size:17px;font-weight:800;letter-spacing:-.3px;color:#60a5fa}
.to{opacity:.6;font-weight:400;font-size:12px}
.muted{opacity:.6}
.last{margin:12px 0 10px;padding:8px 10px;border-radius:8px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.arrow{color:#60a5fa;font-weight:800}
.meta{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.tag{display:inline-block;width:fit-content;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--vscode-panel-border)}
.tag.hot{border-color:#e3a008;color:#e3a008}
.empty{padding:14px 4px;text-align:center;line-height:1.7}
button{width:100%;font:inherit;background:linear-gradient(90deg,#3b82f6,#1e3a8a);color:#fff;border:0;border-radius:8px;padding:8px;cursor:pointer}
button:hover{opacity:.92}
</style></head><body>
${inner}
<script>
const v = acquireVsCodeApi();
const b = document.getElementById('more');
if (b) b.addEventListener('click', () => v.postMessage({ type: 'openPanel' }));
</script>
</body></html>`;
  }
}

function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
