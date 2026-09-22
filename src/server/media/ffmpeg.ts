import { execFile, execFileSync, spawn } from "node:child_process";
import { getServerEnv } from "@/src/lib/env";

/**
 * FFmpeg media-processing adapter (binary use — no linked code, no
 * copyleft obligations on TubeRack). All operations run as child
 * processes; long work belongs in jobs (see src/server/jobs/store.ts),
 * never inside a normal API request. When no binary is configured the
 * adapter reports unavailable instead of failing — Vercel serverless has
 * no FFmpeg, so generation features stay honestly gated there.
 */

export class FFmpegUnavailableError extends Error {
  readonly code = "FFMPEG_UNAVAILABLE";
  constructor(detail?: string) {
    super(`FFmpeg is not configured${detail ? ` (${detail})` : ""}. Set FFMPEG_PATH to a local binary.`);
    this.name = "FFmpegUnavailableError";
  }
}

export class FFmpegError extends Error {
  readonly code = "FFMPEG_FAILED";
  constructor(message: string) {
    super(`FFmpeg failed: ${message.slice(0, 500)}`);
    this.name = "FFmpegError";
  }
}

function binaryPath(kind: "ffmpeg" | "ffprobe"): string {
  const env = getServerEnv();
  if (env.FFMPEG_PATH) {
    if (kind === "ffmpeg") return env.FFMPEG_PATH;
    return env.FFMPEG_PATH.replace(/ffmpeg([^/\\]*)$/i, "ffprobe$1");
  }
  return kind;
}

let availability: { checked: boolean; available: boolean; version: string | null } = {
  checked: false,
  available: false,
  version: null,
};

/** Probe for a working binary (cached per process). */
export function ffmpegStatus(): { available: boolean; version: string | null; path: string } {
  const path = binaryPath("ffmpeg");
  if (availability.checked) return { ...availability, path };
  try {
    const out = execFileSync(path, ["-version"], { timeout: 8000, stdio: ["ignore", "pipe", "pipe"] });
    const first = out.toString().split("\n")[0] ?? "";
    const version = /ffmpeg version (\S+)/i.exec(first)?.[1] ?? null;
    availability = { checked: true, available: true, version };
  } catch {
    availability = { checked: true, available: false, version: null };
  }
  return { ...availability, path };
}

/** For tests: reset the cached probe. */
export function __resetFFmpegCache(): void {
  availability = { checked: false, available: false, version: null };
}

export interface MediaProbe {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sizeBytes: number | null;
}

/** ffprobe metadata for validation gates (resolution, codec, duration). */
export function probeMedia(filePath: string): Promise<MediaProbe> {
  const { available } = ffmpegStatus();
  if (!available) return Promise.reject(new FFmpegUnavailableError());
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath("ffprobe"),
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { timeout: 15000 },
      (error, stdout) => {
        if (error) {
          reject(new FFmpegError(error.message));
          return;
        }
        try {
          const data = JSON.parse(stdout.toString()) as {
            format?: { duration?: string; size?: string };
            streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
          };
          const video = (data.streams ?? []).find((s) => s.codec_type === "video");
          const audio = (data.streams ?? []).find((s) => s.codec_type === "audio");
          const duration = data.format?.duration ? Number(data.format.duration) : NaN;
          const size = data.format?.size ? Number(data.format.size) : NaN;
          resolve({
            durationSec: Number.isFinite(duration) ? duration : null,
            width: typeof video?.width === "number" ? video.width : null,
            height: typeof video?.height === "number" ? video.height : null,
            videoCodec: typeof video?.codec_name === "string" ? video.codec_name : null,
            audioCodec: typeof audio?.codec_name === "string" ? audio.codec_name : null,
            sizeBytes: Number.isFinite(size) ? Math.floor(size) : null,
          });
        } catch {
          reject(new FFmpegError("unparseable ffprobe output"));
        }
      },
    );
  });
}

/* ---------------- pure argument builders (no binary needed) ---------------- */

function seconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new FFmpegError("timestamp must be a non-negative number");
  return String(value);
}

export function trimArgs(input: string, output: string, startSec: number, endSec?: number): string[] {
  const args = ["-y", "-ss", seconds(startSec), "-i", input];
  if (endSec !== undefined) args.push("-to", seconds(endSec));
  return [...args, "-c", "copy", output];
}

export function concatArgs(inputs: string[], output: string): { args: string[]; fileList: string } {
  if (inputs.length < 2) throw new FFmpegError("concat needs at least two inputs");
  const fileList = inputs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  return { args: ["-y", "-f", "concat", "-safe", "0", "-protocol_whitelist", "file,pipe", "-i", "pipe:0", "-c", "copy", output], fileList };
}

export function scaleArgs(input: string, output: string, width: number, height: number): string[] {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w <= 0 || h <= 0 || w > 7680 || h > 4320) throw new FFmpegError("invalid scale dimensions");
  return ["-y", "-i", input, "-vf", `scale=${w}:${h}`, "-c:a", "copy", output];
}

export function mixArgs(narration: string, music: string, output: string, musicVolume = 0.15): string[] {
  if (musicVolume <= 0 || musicVolume > 1) throw new FFmpegError("music volume must be in (0, 1]");
  return [
    "-y",
    "-i", narration,
    "-i", music,
    "-filter_complex", `[1:a]volume=${musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=longest[a]`,
    "-map", "[a]",
    "-c:a", "aac",
    output,
  ];
}

export function burnSubtitlesArgs(input: string, subtitlesPath: string, output: string): string[] {
  const escaped = subtitlesPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  return ["-y", "-i", input, "-vf", `subtitles='${escaped}'`, "-c:a", "copy", output];
}

export function thumbnailArgs(input: string, output: string, atSec = 1, width = 1280): string[] {
  return ["-y", "-ss", seconds(atSec), "-i", input, "-frames:v", "1", "-vf", `scale=${Math.floor(width)}:-1`, output];
}

export interface RunResult {
  exitCode: number;
  durationMs: number;
}

/**
 * Run FFmpeg with args. Parses `time=` progress from stderr for job
 * updates. Throws FFmpegUnavailableError (no binary) or FFmpegError
 * (non-zero exit). Callers must run this from a background runner —
 * never await it inside a request handler.
 */
export function runFFmpeg(
  args: string[],
  options: { stdin?: string; timeoutMs?: number; onProgressSec?: (sec: number) => void } = {},
): Promise<RunResult> {
  const { available } = ffmpegStatus();
  if (!available) return Promise.reject(new FFmpegUnavailableError());
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath("ffmpeg"), args, { timeout: options.timeoutMs ?? 30 * 60 * 1000 });
    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text.slice(-2000);
      const match = /time=(\d+):(\d+):([\d.]+)/.exec(text);
      if (match && options.onProgressSec) {
        const sec = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        if (Number.isFinite(sec)) options.onProgressSec(sec);
      }
    });
    child.on("error", (error) => reject(new FFmpegError(error.message)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ exitCode: 0, durationMs: Date.now() - started });
      } else {
        const tail = stderr.trim().split("\n").slice(-3).join(" / ");
        reject(new FFmpegError(`exit ${String(code)}${tail ? `: ${tail}` : ""}`));
      }
    });
  });
}
