import { Footprint, fmtWater, fmtEnergy, waterComparison } from "./water";
import { ScanResult } from "./parse";

const LINK = "https://water.signalizeai.org";

// Screenshot-friendly shareable card text.
export function shareCard(res: ScanResult, fp: Footprint, actualTokens: number): string {
  const logged = res.today.total;
  const usedActual = actualTokens > 0;
  const basis = usedActual ? actualTokens : logged;
  const models = Object.entries(res.today.perModel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, t]) => `  ${short(m)}: ${fmtTokens(t)}`)
    .join("\n");

  return [
    "💧 My AI coding water footprint today",
    "",
    `Water:  ${fmtWater(fp.waterMl.low)} to ${fmtWater(fp.waterMl.high)}  (~${waterComparison(fp.waterMl.high)})`,
    `Energy: ${fmtEnergy(fp.energyWh.low)} to ${fmtEnergy(fp.energyWh.high)}`,
    "",
    `Tokens (basis): ${fmtTokens(basis)}${usedActual ? " (actual)" : " (logged, undercounts 10-100x)"}`,
    usedActual ? `Logged in JSONL: ${fmtTokens(logged)}` : "Set water.actualTokens for the real figure.",
    "",
    models ? "Top models:\n" + models : "",
    "",
    "Range spans vendor-optimistic to academic-pessimistic estimates.",
    `Measured locally, no network. via Water for VS Code — ${LINK}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function short(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "").slice(0, 28);
}

export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
