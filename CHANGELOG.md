# Changelog

## 0.1.0

- Initial release.
- Live status-bar water/energy estimate for today's AI coding usage, color-ramped blue.
- Local parsing of Claude Code JSONL (dedupe by uuid) and Codex sessions (per-turn deltas, includes reasoning tokens).
- Honest range from labeled optimistic/pessimistic coefficients, with a 10x reasoning-model multiplier.
- Panel: 0.3 mL to 519 mL range bar, per-model breakdown, logged-vs-actual token discrepancy, and copy-shareable-card.
- 100% local, no network, no telemetry.
