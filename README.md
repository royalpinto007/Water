# Water

> Your AI coding assistant drinks water. Water shows you how much, live in your status bar.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![VS Code extension](https://img.shields.io/badge/VS%20Code-extension-007ACC.svg)
![Runs 100% locally](https://img.shields.io/badge/network-none-brightgreen.svg)

See the estimated **water and energy footprint of your AI coding usage**, live in the VS Code status bar. It reads your Claude Code and Codex logs on disk and shows the running cost of today's prompts, no account, no API key, no telemetry, fully offline.

![status bar](media/icon.png)

<!-- Add a short screen-recording GIF of the status bar counting up here (media/demo.gif). It is the single biggest lever for stars. -->

## What it does

- Reads your Claude Code logs (`~/.claude/projects/*/*.jsonl`) and Codex sessions (`~/.codex/sessions/`) directly on disk.
- Shows today's estimated water use in the status bar, updating live as you work. The color deepens from light to deep blue as it climbs.
- Click it for a panel with the honest range, a per-model breakdown, the logged-vs-actual token discrepancy, and a "copy shareable card" button.

## The honest-range philosophy

There is no single true number for the water cost of AI. Published figures for one prompt span **more than 1000x**, because they disagree on model size, data-centre efficiency, and what they count. So Water never shows one fabricated number: it shows a **range**, with every coefficient labeled and sourced.

- **Optimistic:** Google ~0.26 mL/prompt, Sam Altman ~0.32 mL (~0.34 Wh) per prompt.
- **Pessimistic:** UC Riverside ~10-25 mL/prompt; 519 mL worst-case ceiling.
- **Reasoning multiplier:** heavyweight models (Opus, o1/o3, GPT-5, etc.) get a 10x weight on the high end, because model choice is the biggest real lever.

## The logged-vs-actual discrepancy (a feature, not a bug)

Raw JSONL logs **undercount real token usage by 10-100x**: they use streaming placeholders and omit hidden thinking tokens. Water surfaces this instead of hiding it:

- It always shows the raw **logged** sum.
- Set `water.actualTokens` to the accurate total from Claude Code's statusline, and Water shows the corrected **actual** figure, the undercount factor, and scales the estimate to reality.
- Codex logs include `reasoning_output_tokens`, so its counts are already closer to the truth.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `water.actualTokens` | `0` | Your real total from the statusline. 0 = unknown (estimate is then a floor). |
| `water.tokensPerPrompt` | `500` | Labeled assumption mapping tokens onto per-prompt figures. |
| `water.refreshSeconds` | `5` | How often to re-scan the log dirs. |

## Commands

- **Water: Show footprint panel**
- **Water: Refresh now**
- **Water: Copy shareable card**

## Privacy

Everything runs locally in the extension host. Water makes no network requests and stores nothing outside your machine. The only link it emits is the one you choose to paste in a shared card: <https://water.signalizeai.org>.

## Build from source

```bash
npm install
npm run build       # bundle with esbuild -> dist/extension.js
npm run package     # -> water.vsix
```

Install the VSIX: `code --install-extension water.vsix`.

## License

MIT
