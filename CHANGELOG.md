# Changelog

## 0.2.0
- Added a live "Session footprint" banner view (Water icon in the activity bar; drag it to the right-hand secondary side bar to sit next to Claude Code / Codex).
- Banner shows the current session's water range plus the increment from the last message you sent, updating live.
- New setting `water.showStatusBar` to hide the status-bar item and use only the banner.
- Landing page at water.signalizeai.org.

## 0.1.0
- Initial release.
- Live status-bar water/energy estimate for today's AI coding usage, color-ramped blue.
- Local parsing of Claude Code JSONL (dedupe by uuid) and Codex sessions (per-turn deltas, includes reasoning tokens).
- Honest range from labeled optimistic/pessimistic coefficients, with a 10x reasoning-model multiplier.
- Panel: 0.3 mL to 519 mL range bar, per-model breakdown, logged-vs-actual token discrepancy, and copy-shareable-card.
- 100% local, no network, no telemetry.
