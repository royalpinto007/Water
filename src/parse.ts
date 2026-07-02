import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// A parsed token tally, split so the panel can show the honest breakdown.
export interface Tally {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  reasoning: number; // Codex logs this; Claude JSONL omits it (part of the undercount)
  total: number; // billable-ish: input + output + cache_creation (cache_read is cheap/echoed)
  messages: number;
  perModel: Record<string, number>; // model -> total tokens
}

export interface ScanResult {
  today: Tally;
  allTime: Tally;
  claudeDir: string | null;
  codexDir: string | null;
  filesScanned: number;
  errors: number;
}

function emptyTally(): Tally {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    reasoning: 0,
    total: 0,
    messages: 0,
    perModel: {},
  };
}

function addModel(t: Tally, model: string, tokens: number) {
  const m = model || "unknown";
  t.perModel[m] = (t.perModel[m] || 0) + tokens;
}

function isToday(iso: string | undefined, startOfDay: number): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) && ts >= startOfDay;
}

function listFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && full.endsWith(ext)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function readLines(file: string): string[] {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ---- Claude Code: ~/.claude/projects/*/*.jsonl ----
// Each assistant line carries message.usage. Dedupe by top-level uuid.
function parseClaude(
  dir: string,
  startOfDay: number,
  seen: Set<string>,
  res: ScanResult,
) {
  for (const file of listFiles(dir, ".jsonl")) {
    res.filesScanned++;
    for (const line of readLines(file)) {
      let d: any;
      try {
        d = JSON.parse(line);
      } catch {
        res.errors++;
        continue;
      }
      const msg = d?.message;
      const usage = msg?.usage;
      if (!usage) continue;
      const uuid = d.uuid || msg.id;
      if (uuid) {
        if (seen.has(uuid)) continue;
        seen.add(uuid);
      }
      const model = String(msg.model || "unknown");
      if (model === "<synthetic>") continue;

      const input = num(usage.input_tokens);
      const output = num(usage.output_tokens);
      const cacheRead = num(usage.cache_read_input_tokens);
      const cacheCreation = num(usage.cache_creation_input_tokens);
      const billable = input + output + cacheCreation;
      if (input + output + cacheRead + cacheCreation === 0) continue;

      accumulate(res.allTime, model, input, output, cacheRead, cacheCreation, 0, billable);
      if (isToday(d.timestamp, startOfDay)) {
        accumulate(res.today, model, input, output, cacheRead, cacheCreation, 0, billable);
      }
    }
  }
}

// ---- Codex: ~/.codex/sessions/**/**.jsonl ----
// event_msg payloads of type "token_count" carry info.last_token_usage (the
// per-turn delta) and info.total_token_usage (cumulative). We sum the deltas,
// which is dedupe-free and includes reasoning_output_tokens.
function parseCodex(dir: string, startOfDay: number, res: ScanResult) {
  for (const file of listFiles(dir, ".jsonl")) {
    res.filesScanned++;
    let model = "codex";
    for (const line of readLines(file)) {
      let d: any;
      try {
        d = JSON.parse(line);
      } catch {
        res.errors++;
        continue;
      }
      const p = d?.payload;
      if (!p) continue;
      // Track model from context lines.
      if (p.model) model = String(p.model);
      else if (p.type === "session_meta" && p.model) model = String(p.model);

      if (p.type !== "token_count") continue;
      const last = p.info?.last_token_usage;
      if (!last) continue;

      const input = num(last.input_tokens);
      const output = num(last.output_tokens);
      const cacheRead = num(last.cached_input_tokens);
      const reasoning = num(last.reasoning_output_tokens);
      const billable = input + output + reasoning;
      if (input + output + reasoning + cacheRead === 0) continue;

      accumulate(res.allTime, model, input, output, cacheRead, 0, reasoning, billable);
      if (isToday(d.timestamp, startOfDay)) {
        accumulate(res.today, model, input, output, cacheRead, 0, reasoning, billable);
      }
    }
  }
}

function accumulate(
  t: Tally,
  model: string,
  input: number,
  output: number,
  cacheRead: number,
  cacheCreation: number,
  reasoning: number,
  billable: number,
) {
  t.input += input;
  t.output += output;
  t.cacheRead += cacheRead;
  t.cacheCreation += cacheCreation;
  t.reasoning += reasoning;
  t.total += billable;
  t.messages += 1;
  addModel(t, model, billable);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function scan(): ScanResult {
  const home = os.homedir();
  const claudeDir = path.join(home, ".claude", "projects");
  const codexDir = path.join(home, ".codex", "sessions");
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startOfDay = start.getTime();

  const res: ScanResult = {
    today: emptyTally(),
    allTime: emptyTally(),
    claudeDir: fs.existsSync(claudeDir) ? claudeDir : null,
    codexDir: fs.existsSync(codexDir) ? codexDir : null,
    filesScanned: 0,
    errors: 0,
  };

  const seen = new Set<string>();
  if (res.claudeDir) parseClaude(res.claudeDir, startOfDay, seen, res);
  if (res.codexDir) parseCodex(res.codexDir, startOfDay, res);
  return res;
}

// Directories to watch for live updates (whichever exist).
export function logDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".claude", "projects"),
    path.join(home, ".codex", "sessions"),
  ].filter((d) => fs.existsSync(d));
}
