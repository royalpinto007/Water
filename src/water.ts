// Water / energy footprint math.
//
// Honesty first: there is no single true number. Published figures for the
// water/energy cost of one AI prompt span more than three orders of magnitude,
// because they disagree on model size, data-centre efficiency (WUE/PUE), and
// whether they count on-site cooling only or off-site power generation too.
// So we never show one number. We show a RANGE, with every coefficient labeled
// and sourced, and we let model choice move the estimate (the biggest real lever).

// Per-prompt figures as published (milliliters of water per prompt), labeled.
export const WATER_COEFFICIENTS = {
  // Optimistic end. Vendor/first-party estimates.
  googleMlPerPrompt: 0.26, // Google, median Gemini text prompt (2025)
  altmanMlPerPrompt: 0.32, // Sam Altman blog, "roughly one fifteenth of a teaspoon" (~0.32 mL)
  // Pessimistic end. Independent academic estimates (on-site + off-site).
  riversideLowMlPerPrompt: 10, // UC Riverside, low end for a longer session
  riversideHighMlPerPrompt: 25, // UC Riverside, high end (GPT-class, warm region)
  ceilingMlPerPrompt: 519, // widely cited worst-case ceiling for a long GPT session
} as const;

// Per-prompt energy (watt-hours), labeled.
export const ENERGY_COEFFICIENTS = {
  altmanWhPerPrompt: 0.34, // Sam Altman blog, ~0.34 Wh per query
  epochLowWhPerPrompt: 0.3, // Epoch AI, typical short query
  epochHighWhPerPrompt: 3.0, // Epoch AI, longer query, larger model
} as const;

// Heavyweight reasoning models burn far more per token (long hidden thinking).
// Model choice is the single biggest real lever, so we surface it: any model
// matching this list gets a multiplier applied to its share of the estimate.
export const REASONING_MULTIPLIER = 10;
export const REASONING_MODEL_PATTERN =
  /(opus|o1|o3|o4|gpt-5|reasoning|think|r1|sonnet-4|4\.5|4\.8)/i;

export function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PATTERN.test(model || "");
}

export interface Range {
  low: number;
  high: number;
}

export interface Footprint {
  waterMl: Range; // honest low..high
  energyWh: Range;
  promptEquivalents: number;
  reasoningWeightedPrompts: number; // prompts after applying the reasoning multiplier
}

// Convert a token total (optionally per-model) into a water/energy range.
// tokensPerPrompt is a labeled assumption used to map tokens onto the
// per-prompt published figures.
export function footprintFromModels(
  perModelTokens: Record<string, number>,
  tokensPerPrompt: number,
): Footprint {
  const tpp = tokensPerPrompt > 0 ? tokensPerPrompt : 500;
  let rawPrompts = 0;
  let weightedPrompts = 0;
  for (const [model, tokens] of Object.entries(perModelTokens)) {
    const prompts = tokens / tpp;
    rawPrompts += prompts;
    weightedPrompts += prompts * (isReasoningModel(model) ? REASONING_MULTIPLIER : 1);
  }

  const c = WATER_COEFFICIENTS;
  const e = ENERGY_COEFFICIENTS;

  // Low end: optimistic vendor figure on raw prompts (no reasoning penalty).
  const waterLow = rawPrompts * Math.min(c.googleMlPerPrompt, c.altmanMlPerPrompt);
  // High end: pessimistic academic figure on reasoning-weighted prompts.
  const waterHigh = weightedPrompts * c.riversideHighMlPerPrompt;

  const energyLow = rawPrompts * e.epochLowWhPerPrompt;
  const energyHigh = weightedPrompts * e.epochHighWhPerPrompt;

  return {
    waterMl: { low: round(waterLow, 2), high: round(waterHigh, 1) },
    energyWh: { low: round(energyLow, 2), high: round(energyHigh, 1) },
    promptEquivalents: round(rawPrompts, 1),
    reasoningWeightedPrompts: round(weightedPrompts, 1),
  };
}

function round(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

// Human-friendly water volume string.
export function fmtWater(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(ml >= 10000 ? 0 : 1)} L`;
  if (ml >= 10) return `${Math.round(ml)} mL`;
  return `${ml.toFixed(1)} mL`;
}

export function fmtEnergy(wh: number): string {
  if (wh >= 1000) return `${(wh / 1000).toFixed(1)} kWh`;
  if (wh >= 10) return `${Math.round(wh)} Wh`;
  return `${wh.toFixed(2)} Wh`;
}

// Relatable comparison for a water volume (mL).
export function waterComparison(ml: number): string {
  if (ml < 5) return "a few drops";
  if (ml < 250) return `about ${Math.max(1, Math.round(ml / 5))} teaspoon(s)`;
  if (ml < 2000) return `about ${(ml / 250).toFixed(1)} cup(s)`;
  return `about ${(ml / 1000).toFixed(1)} litre bottle(s)`;
}
