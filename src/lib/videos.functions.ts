import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type VideoRow = Database["public"]["Tables"]["videos"]["Row"];

export type VideoDTO = {
  id: string;
  title: string;
  description: string;
  channelName: string;
  channelInitials: string;
  channelColor: string;
  category: string;
  duration: string;
  gradient: string;
  videoUrl: string;
  mimeType: string;
  views: number;
  createdAt: string;
  thumbnailUrl: string | null;
  sourceKind: "file" | "url" | "embed";
  embedProvider: string | null;
  embedVideoId: string | null;
};


function serverPublicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function signIfNeeded(row: VideoRow): Promise<VideoDTO> {
  const kind = (row.source_kind ?? "file") as "file" | "url" | "embed";
  let url = row.video_url;
  let thumb: string | null = row.thumbnail_url ?? null;

  if (kind === "url" && row.external_url) {
    url = row.external_url;
  } else if (kind === "embed" && row.embed_provider && row.embed_video_id) {
    // For embeds we return a canonical embed URL. The frontend renders an iframe.
    if (row.embed_provider === "youtube") {
      url = `https://www.youtube-nocookie.com/embed/${row.embed_video_id}?rel=0&modestbranding=1&playsinline=1`;
      if (!thumb) thumb = `https://i.ytimg.com/vi/${row.embed_video_id}/hqdefault.jpg`;
    } else if (row.embed_provider === "vimeo") {
      url = `https://player.vimeo.com/video/${row.embed_video_id}?dnt=1`;
    }
  } else if (kind === "file" && row.storage_path) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { data } = await supabaseAdmin.storage
        .from("videos")
        .createSignedUrl(row.storage_path, 60 * 60 * 6);
      if (data?.signedUrl) url = data.signedUrl;
    } catch {}
  }

  if (row.thumbnail_path) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { data } = await supabaseAdmin.storage
        .from("videos")
        .createSignedUrl(row.thumbnail_path, 60 * 60 * 6);
      if (data?.signedUrl) thumb = data.signedUrl;
    } catch {}
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    channelName: row.channel_name,
    channelInitials: row.channel_initials || row.channel_name.slice(0, 2).toUpperCase(),
    channelColor: row.channel_color,
    category: row.category,
    duration: row.duration,
    gradient: row.gradient,
    videoUrl: url,
    mimeType: row.mime_type,
    views: Number(row.views ?? 0),
    createdAt: row.created_at,
    thumbnailUrl: thumb,
    sourceKind: kind,
    embedProvider: row.embed_provider ?? null,
    embedVideoId: row.embed_video_id ?? null,
  };
}


export const listVideos = createServerFn({ method: "GET" }).handler(async () => {
  const sb = serverPublicClient();
  const { data, error } = await sb
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return Promise.all(rows.map((r) => signIfNeeded(r as VideoRow)));
});

export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { isAdmin: !!data };
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_admin");
    if (error) throw new Error(error.message);
    return { claimed: !!data };
  });

const CreateVideoInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(""),
  category: z.string().min(1).max(60),
  duration: z.string().max(20).default("0:00"),
  gradient: z.string().max(300).default(
    "linear-gradient(135deg, #1a0f2e 0%, #3d1d5c 45%, #e11d48 100%)",
  ),
  sourceKind: z.enum(["file", "url", "embed"]).default("file"),
  videoUrl: z.string().url().optional(),         // legacy / file uploads
  storagePath: z.string().optional(),
  externalUrl: z.string().url().optional(),      // direct external stream
  embedProvider: z.enum(["youtube", "vimeo"]).optional(),
  embedVideoId: z.string().max(64).optional(),
  mimeType: z.string().max(80).default("video/mp4"),
  thumbnailPath: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
});

export const createVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateVideoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: role, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!role) throw new Error("Forbidden: admin only");

    // Validate that the source of truth matches sourceKind
    if (data.sourceKind === "file" && !data.storagePath && !data.videoUrl) {
      throw new Error("Provide a file (storagePath) or a videoUrl");
    }
    if (data.sourceKind === "url" && !data.externalUrl) {
      throw new Error("Provide externalUrl for a direct-stream video");
    }
    if (data.sourceKind === "embed" && (!data.embedProvider || !data.embedVideoId)) {
      throw new Error("Provide embedProvider and embedVideoId for an embed");
    }

    // Channel identity comes from the uploader's profile, not from user input.
    const { data: profile, error: profileErr } = await context.supabase
      .from("profiles")
      .select("channel_name, channel_color, channel_initials")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile) throw new Error("No profile found for uploader");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("videos")
      .insert({
        title: data.title,
        description: data.description,
        channel_name: profile.channel_name,
        channel_initials: profile.channel_initials,
        channel_color: profile.channel_color,
        category: data.category,
        duration: data.duration,
        gradient: data.gradient,
        source_kind: data.sourceKind,
        video_url: data.videoUrl ?? data.externalUrl ?? "",
        storage_path: data.storagePath ?? null,
        external_url: data.externalUrl ?? null,
        embed_provider: data.embedProvider ?? null,
        embed_video_id: data.embedVideoId ?? null,
        mime_type: data.mimeType,
        thumbnail_path: data.thumbnailPath ?? null,
        thumbnail_url: data.thumbnailUrl ?? null,
        uploaded_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });


const UploadUrlInput = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  kind: z.enum(["video", "thumbnail"]).default("video"),
});

export const getUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadUrlInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Forbidden: admin only");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const prefix = data.kind === "thumbnail" ? "thumbnails" : "videos";
    const path = `${prefix}/${context.userId}/${Date.now()}-${safe}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("videos")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("videos")
      .select("storage_path, thumbnail_path")
      .eq("id", data.id)
      .maybeSingle();
    const paths = [row?.storage_path, row?.thumbnail_path].filter(Boolean) as string[];
    if (paths.length) await supabaseAdmin.storage.from("videos").remove(paths);
    const { error } = await supabaseAdmin.from("videos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------- Engagement -------- */

export const getVideoStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = serverPublicClient();
    const [likes, dislikes] = await Promise.all([
      sb.from("video_likes").select("*", { count: "exact", head: true }).eq("video_id", data.videoId).eq("value", 1),
      sb.from("video_likes").select("*", { count: "exact", head: true }).eq("video_id", data.videoId).eq("value", -1),
    ]);
    return { likes: likes.count ?? 0, dislikes: dislikes.count ?? 0 };
  });

export const getMyLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("video_likes")
      .select("value")
      .eq("video_id", data.videoId)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { value: (row?.value ?? 0) as -1 | 0 | 1 };
  });

export const setLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ videoId: z.string().uuid(), value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.value === 0) {
      await context.supabase
        .from("video_likes")
        .delete()
        .eq("video_id", data.videoId)
        .eq("user_id", context.userId);
    } else {
      await context.supabase
        .from("video_likes")
        .upsert(
          { video_id: data.videoId, user_id: context.userId, value: data.value },
          { onConflict: "user_id,video_id" },
        );
    }
    return { ok: true };
  });

export const getSubscriberCount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ channelName: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const sb = serverPublicClient();
    // subscriptions.SELECT is owner-only; call the SECURITY DEFINER aggregate.
    const { data: n, error } = await sb.rpc("get_subscriber_count", {
      _channel_name: data.channelName,
    });
    if (error) return { count: 0 };
    return { count: Number(n ?? 0) };
  });


export const getMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channelName: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("subscriptions")
      .select("id")
      .eq("channel_name", data.channelName)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { subscribed: !!row };
  });

export const toggleSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channelName: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("subscriptions")
      .select("id")
      .eq("channel_name", data.channelName)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (row) {
      await context.supabase.from("subscriptions").delete().eq("id", row.id);
      return { subscribed: false };
    }
    await context.supabase
      .from("subscriptions")
      .insert({ channel_name: data.channelName, user_id: context.userId });
    return { subscribed: true };
  });

export const incrementView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ videoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Respect the viewer's privacy preference: if they choose not to count
    // their own views, do not increment the public counter.
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("privacy_dont_count_views")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.privacy_dont_count_views) {
      return { ok: true, counted: false };
    }
    await context.supabase.rpc("increment_video_views", { _video_id: data.videoId });
    return { ok: true, counted: true };
  });
