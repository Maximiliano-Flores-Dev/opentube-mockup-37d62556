// Client-safe helpers to detect embeddable third-party video URLs
// (YouTube / Vimeo) and to classify direct-stream URLs vs generic "file" URLs.

export type EmbedProvider = "youtube" | "vimeo";

export type SourceAnalysis =
  | { kind: "embed"; provider: EmbedProvider; videoId: string; embedUrl: string; thumbnailUrl: string | null }
  | { kind: "url"; mimeType: string }
  | { kind: "unknown" };

const YT_RES = [
  /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{6,})/i,
  /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i,
  /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i,
  /^(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{6,})/i,
];
const VIMEO_RE = /^(?:https?:\/\/)?(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i;

const DIRECT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
  ogv: "video/ogg",
  ogg: "video/ogg",
  m3u8: "application/vnd.apple.mpegurl",
  mpd: "application/dash+xml",
};

export function analyzeUrl(input: string): SourceAnalysis {
  const url = input.trim();
  if (!url) return { kind: "unknown" };

  for (const re of YT_RES) {
    const m = url.match(re);
    if (m) {
      const id = m[1];
      return {
        kind: "embed",
        provider: "youtube",
        videoId: id,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }
  const vm = url.match(VIMEO_RE);
  if (vm) {
    const id = vm[1];
    return {
      kind: "embed",
      provider: "vimeo",
      videoId: id,
      embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
      thumbnailUrl: null,
    };
  }

  try {
    const u = new URL(url);
    const ext = u.pathname.split(".").pop()?.toLowerCase() ?? "";
    if (ext && DIRECT_MIME[ext]) return { kind: "url", mimeType: DIRECT_MIME[ext] };
  } catch {}
  // Unknown extension — still allow as direct URL, default to mp4
  return { kind: "url", mimeType: "video/mp4" };
}
