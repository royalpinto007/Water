import * as vscode from "vscode";
import * as fs from "fs";
import { scan, logDirs, currentSession, ScanResult } from "./parse";
import { footprintFromModels, Footprint, fmtWater } from "./water";
import { panelHtml } from "./panel";
import { shareCard } from "./card";
import { BannerView } from "./bannerView";

let statusItem: vscode.StatusBarItem;
let banner: BannerView;
let panel: vscode.WebviewPanel | undefined;
let timer: NodeJS.Timeout | undefined;
let watchers: fs.FSWatcher[] = [];
let lastCard = "";

function cfg() {
  const c = vscode.workspace.getConfiguration("water");
  return {
    actualTokens: Math.max(0, c.get<number>("actualTokens", 0)),
    tokensPerPrompt: c.get<number>("tokensPerPrompt", 500),
    refreshSeconds: Math.max(2, c.get<number>("refreshSeconds", 5)),
    showStatusBar: c.get<boolean>("showStatusBar", true),
    notifyOnMessage: c.get<boolean>("notifyOnMessage", true),
  };
}

// Track the newest session so we can toast the moment a new message lands.
let notifyFile = "";
let notifyMsgs = -1;

// Deepen the blue as today's high-end water estimate climbs (log scale to 519 mL).
function rampColor(highMl: number): string {
  const t = Math.max(0, Math.min(1, Math.log10(Math.max(highMl, 1)) / Math.log10(519)));
  // #60a5fa (light) -> #1e3a8a (deep)
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp(0x60, 0x1e);
  const g = lerp(0xa5, 0x3a);
  const b = lerp(0xfa, 0x8a);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function compute(): { res: ScanResult; fp: Footprint; actual: number } {
  const { actualTokens, tokensPerPrompt } = cfg();
  const res = scan();

  // If the user provided an accurate total, scale the logged per-model mix up
  // to that actual figure so the estimate reflects reality, not the undercount.
  let perModel = res.today.perModel;
  if (actualTokens > 0 && res.today.total > 0) {
    const factor = actualTokens / res.today.total;
    perModel = Object.fromEntries(
      Object.entries(res.today.perModel).map(([m, t]) => [m, t * factor]),
    );
  }
  const fp = footprintFromModels(perModel, tokensPerPrompt);
  return { res, fp, actual: actualTokens };
}

function refresh() {
  const { res, fp, actual } = compute();
  const { tokensPerPrompt, showStatusBar } = cfg();
  lastCard = shareCard(res, fp, actual);

  // Live banner: current session + last-message delta.
  const actualFactor = actual > 0 && res.today.total > 0 ? actual / res.today.total : 1;
  const session = currentSession();
  if (banner) banner.update(session, tokensPerPrompt, actualFactor);
  maybeNotify(session, tokensPerPrompt, actualFactor);

  if (showStatusBar) {
    statusItem.text = `$(beaker) ${fmtWater(fp.waterMl.low)}-${fmtWater(fp.waterMl.high)}`;
    statusItem.color = rampColor(fp.waterMl.high);
    const undercount =
      actual > 0 && res.today.total > 0 ? ` (actual ~${Math.round(actual / res.today.total)}x logged)` : "";
    statusItem.tooltip = new vscode.MarkdownString(
      `**Water today**: ${fmtWater(fp.waterMl.low)} to ${fmtWater(fp.waterMl.high)}\n\n` +
        `Logged tokens: ${res.today.total.toLocaleString()}${undercount}\n\n` +
        `Click for the honest range, per-model breakdown, and a shareable card.`,
    );
    statusItem.show();
  } else {
    statusItem.hide();
  }

  if (panel) panel.webview.html = panelHtml(res, fp, actual, lastCard);
}

// Pop a transient toast the moment a new message completes in the active session.
function maybeNotify(
  session: ReturnType<typeof currentSession>,
  tokensPerPrompt: number,
  actualFactor: number,
) {
  if (!cfg().notifyOnMessage || !session) return;
  // Baseline (first sight, or session switched): set state, do not toast.
  if (session.file !== notifyFile) {
    notifyFile = session.file;
    notifyMsgs = session.messages;
    return;
  }
  if (notifyMsgs >= 0 && session.messages > notifyMsgs && session.lastDelta > 0) {
    const fp = footprintFromModels(
      { [session.model]: session.lastDelta * actualFactor },
      tokensPerPrompt,
    );
    vscode.window.showInformationMessage(
      `💧 That message used about ${fmtWater(fp.waterMl.low)} to ${fmtWater(fp.waterMl.high)} of water.`,
    );
  }
  notifyMsgs = session.messages;
}

function openPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Active);
    refresh();
    return;
  }
  panel = vscode.window.createWebviewPanel("water", "Water footprint", vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.onDidDispose(() => (panel = undefined), null, context.subscriptions);
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === "copyCard") {
      await vscode.env.clipboard.writeText(lastCard);
      vscode.window.setStatusBarMessage("Water: shareable card copied", 2500);
    }
  });
  refresh();
}

function startWatching() {
  const { refreshSeconds } = cfg();
  // Poll (reliable across platforms; fs.watch recursive is not supported on Linux).
  timer = setInterval(refresh, refreshSeconds * 1000);
  // Plus best-effort fs.watch on the top-level log dirs for near-instant updates.
  for (const dir of logDirs()) {
    try {
      const w = fs.watch(dir, { recursive: process.platform !== "linux" }, () => refresh());
      watchers.push(w);
    } catch {
      /* ignore; the poll covers it */
    }
  }
}

function stopWatching() {
  if (timer) clearInterval(timer);
  timer = undefined;
  for (const w of watchers) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
  }
  watchers = [];
}

export function activate(context: vscode.ExtensionContext) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = "water.showPanel";
  context.subscriptions.push(statusItem);

  banner = new BannerView();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BannerView.viewId, banner, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("water.showPanel", () => openPanel(context)),
    vscode.commands.registerCommand("water.refresh", () => refresh()),
    vscode.commands.registerCommand("water.copyCard", async () => {
      await vscode.env.clipboard.writeText(lastCard);
      vscode.window.showInformationMessage("Water: shareable card copied to clipboard.");
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("water")) {
        stopWatching();
        startWatching();
        refresh();
      }
    }),
  );

  refresh();
  startWatching();
}

export function deactivate() {
  stopWatching();
}
