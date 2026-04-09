import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { logVerbose } from "openclaw/plugin-sdk/runtime-env";

const execFileAsync = promisify(execFile);

/**
 * Renders the first frame of a .webm video sticker to PNG using ffmpeg.
 * Returns a PNG Buffer, or null if ffmpeg is unavailable or rendering fails.
 */
export async function renderVideoStickerFrame(inputPath: string): Promise<Buffer | null> {
  const outPath = path.join(tmpdir(), `tg-sticker-${Date.now()}.png`);
  try {
    await execFileAsync("ffmpeg", ["-y", "-i", inputPath, "-vframes", "1", "-f", "image2", outPath], {
      timeout: 15_000,
    });
    const buf = await fs.readFile(outPath);
    logVerbose("telegram: rendered video sticker to PNG via ffmpeg");
    return buf;
  } catch (err) {
    logVerbose(`telegram: ffmpeg sticker render failed: ${String(err)}`);
    return null;
  } finally {
    await fs.unlink(outPath).catch(() => {});
  }
}

// Python script for rendering .tgs (Lottie/gzip) animated stickers via rlottie_python.
const TGS_RENDER_SCRIPT = `\
import sys
def render(tgs_path, out_path):
    try:
        import rlottie_python
        anim = rlottie_python.LottieAnimation.from_tgs(tgs_path)
        anim.save_frame(out_path, frame_num=0)
        return True
    except Exception as e:
        print(f"rlottie_python error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    ok = render(sys.argv[1], sys.argv[2])
    sys.exit(0 if ok else 1)
`;

/**
 * Renders the first frame of a .tgs animated sticker to PNG using Python rlottie_python.
 * Returns a PNG Buffer, or null if python/rlottie_python is unavailable or rendering fails.
 */
export async function renderAnimatedStickerFrame(inputPath: string): Promise<Buffer | null> {
  const outPath = path.join(tmpdir(), `tg-sticker-${Date.now()}.png`);
  const scriptPath = path.join(tmpdir(), `tg-sticker-render-${Date.now()}.py`);
  try {
    await fs.writeFile(scriptPath, TGS_RENDER_SCRIPT);
    await execFileAsync("python3", [scriptPath, inputPath, outPath], { timeout: 15_000 });
    const buf = await fs.readFile(outPath);
    logVerbose("telegram: rendered animated sticker (.tgs) to PNG via rlottie_python");
    return buf;
  } catch (err) {
    logVerbose(`telegram: rlottie_python sticker render failed: ${String(err)}`);
    return null;
  } finally {
    await fs.unlink(outPath).catch(() => {});
    await fs.unlink(scriptPath).catch(() => {});
  }
}
