// Watches the memory of everything the app runs: Electron's own processes, Claude Code and the
// Python jobs. On macOS it measures what Activity Monitor shows (the physical footprint: ps's rss
// leaves out compressed memory and the GPU memory PyTorch uses on Apple Silicon, so a 2.6 GB
// process can read as 400 MB). When one grows past PROCESS_MB (or all together past TOTAL_MB) it appends a
// snapshot to memory.log in the app's logs folder (Help → Show Logs): every process with its
// memory and command, plus what the app was doing. Then again for each further STEP_MB, so a
// leak leaves a trace to debug. No imports from electron, so the parsing is testable.
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const PROCESS_MB = 2500;
const TOTAL_MB = 5000;
const STEP_MB = 1000;
const EVERY_MS = 60_000; // footprint takes about 0.3 s of CPU

export interface Proc {
  pid: number;
  ppid: number;
  mb: number;
  command: string;
}

/** The processes under `root` (this app), from `ps -axo pid=,ppid=,rss=,command=` (rss in kB). */
export function processTree(ps: string, root: number): Proc[] {
  const all = ps
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({
      pid: +m[1],
      ppid: +m[2],
      mb: Math.round(+m[3] / 1024),
      command: m[4].slice(0, 300),
    }));
  const ours = new Set([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of all)
      if (!ours.has(p.pid) && ours.has(p.ppid)) {
        ours.add(p.pid);
        grew = true;
      }
  }
  return all.filter((p) => ours.has(p.pid)).sort((a, b) => b.mb - a.mb);
}

/** `footprint -p …` output → MB per pid ("Electron Helper [37324]: 64-bit    Footprint: 201 MB"). */
export function footprints(out: string): Map<number, number> {
  const unit: Record<string, number> = {
    B: 1 / 2 ** 20,
    KB: 1 / 1024,
    MB: 1,
    GB: 1024,
  };
  const mb = new Map<number, number>();
  for (const m of out.matchAll(
    /\[(\d+)\]:.*?Footprint:\s*([\d.]+)\s*(B|KB|MB|GB)\b/g,
  ))
    mb.set(+m[1], Math.round(+m[2] * unit[m[3]]));
  return mb;
}

/** Starts the watch; `context` says what the app is doing (project, running jobs) when it logs. */
export function watchMemory(
  file: string,
  context: () => Record<string, unknown>,
): void {
  // ponytail: macOS and Linux only (ps); Windows would need tasklist or PowerShell's Get-Process.
  if (process.platform === "win32") return;
  const logged = new Map<string, number>(); // pid or "total" → MB at its last snapshot

  const check = async () => {
    const { stdout } = await exec("ps", ["-axo", "pid=,ppid=,rss=,command="], {
      maxBuffer: 16 << 20,
    });
    let procs = processTree(stdout, process.pid);
    if (process.platform === "darwin") {
      // A process that exits meanwhile makes footprint fail; the rest of its output still counts.
      const args = procs.flatMap((p) => ["-p", String(p.pid)]);
      const out = await exec("footprint", args, { maxBuffer: 16 << 20 }).then(
        (r) => r.stdout,
        (e: { stdout?: string }) => e.stdout ?? "",
      );
      const mb = footprints(out);
      procs = procs
        .map((p) => ({ ...p, mb: mb.get(p.pid) ?? p.mb }))
        .sort((a, b) => b.mb - a.mb);
    }
    const total = procs.reduce((n, p) => n + p.mb, 0);
    const over = procs
      .filter((p) => p.mb >= PROCESS_MB)
      .map((p) => ({
        key: String(p.pid),
        mb: p.mb,
        why: `pid ${p.pid} uses ${p.mb} MB`,
      }));
    if (total >= TOTAL_MB)
      over.push({
        key: "total",
        mb: total,
        why: `all processes together use ${total} MB`,
      });
    for (const key of logged.keys())
      if (!over.some((o) => o.key === key)) logged.delete(key); // gone or back to normal
    const fresh = over.filter(
      (o) => o.mb >= (logged.get(o.key) ?? -Infinity) + STEP_MB,
    );
    if (!fresh.length) return;
    fresh.forEach((o) => logged.set(o.key, o.mb));
    const entry = {
      time: new Date().toISOString(),
      why: fresh.map((o) => o.why),
      totalMb: total,
      processes: procs,
      ...context(),
    };
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(entry, null, 2) + "\n\n");
  };
  setInterval(() => void check().catch(() => undefined), EVERY_MS);
}
