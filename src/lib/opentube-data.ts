import type { VideoDTO } from "./videos.functions";

export type Video = {
  id: string;
  title: string;
  channelName: string;
  channelInitials: string;
  channelColor: string;
  views: string;
  uploadedAt: string;
  duration: string;
  gradient: string;
  videoUrl: string;
  mimeType: string;
  description: string;
  category: string;
  thumbnailUrl: string | null;
  sourceKind: "file" | "url" | "embed";
  embedProvider: string | null;
  embedVideoId: string | null;
};


function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M vistas`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} K vistas`;
  return `${n} vistas`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} semana${weeks > 1 ? "s" : ""}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months > 1 ? "es" : ""}`;
  return `hace ${Math.floor(days / 365)} año${days >= 730 ? "s" : ""}`;
}

export function dtoToVideo(d: VideoDTO): Video {
  return {
    id: d.id,
    title: d.title,
    channelName: d.channelName,
    channelInitials: d.channelInitials,
    channelColor: d.channelColor,
    views: formatViews(d.views),
    uploadedAt: formatRelative(d.createdAt),
    duration: d.duration,
    gradient: d.gradient,
    videoUrl: d.videoUrl,
    mimeType: d.mimeType,
    description: d.description,
    category: d.category,
    thumbnailUrl: d.thumbnailUrl ?? null,
    sourceKind: d.sourceKind,
    embedProvider: d.embedProvider,
    embedVideoId: d.embedVideoId,
  };
}


