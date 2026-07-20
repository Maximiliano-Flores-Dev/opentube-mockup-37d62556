import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type ProfileDTO = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  bio: string;
  channelName: string;
  channelColor: string;
  channelInitials: string;
  privacyHideProgress: boolean;
  privacyDontCountViews: boolean;
};

async function signAvatar(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const { data } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 6);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

function mapProfile(data: Database["public"]["Tables"]["profiles"]["Row"]): Promise<ProfileDTO> {
  return Promise.resolve({
    id: data.id,
    displayName: data.display_name,
    avatarPath: data.avatar_path,
    avatarUrl: null, // callers that need a signed URL call signAvatar separately
    bio: data.bio,
    channelName: data.channel_name,
    channelColor: data.channel_color,
    channelInitials: data.channel_initials,
    privacyHideProgress: data.privacy_hide_progress,
    privacyDontCountViews: data.privacy_dont_count_views,
  });
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileDTO | null> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const profile = await mapProfile(data as Database["public"]["Tables"]["profiles"]["Row"]);
    return { ...profile, avatarUrl: await signAvatar(data.avatar_path) };
  });

export const getProfileByChannel = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ channelName: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<ProfileDTO | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const supabasePublic = createClient<Database>(process.env.SUPABASE_URL!, key, {
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
    const { data: row, error } = await supabasePublic
      .from("profiles")
      .select("*")
      .eq("channel_name", data.channelName)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return mapProfile(row as Database["public"]["Tables"]["profiles"]["Row"]);
  });

const UpdateInput = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(200).optional(),
  channelName: z.string().trim().min(1).max(80).optional(),
  channelColor: z.string().max(80).optional(),
  privacyHideProgress: z.boolean().optional(),
  privacyDontCountViews: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: ProfileUpdate = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.bio !== undefined) patch.bio = data.bio;
    if (data.channelName !== undefined) {
      patch.channel_name = data.channelName;
      patch.channel_initials =
        data.channelName
          .split(/\s+/)
          .map((w) => w[0])
          .filter(Boolean)
          .join("")
          .slice(0, 2)
          .toUpperCase() || "??";
    }
    if (data.channelColor !== undefined) patch.channel_color = data.channelColor;
    if (data.privacyHideProgress !== undefined) patch.privacy_hide_progress = data.privacyHideProgress;
    if (data.privacyDontCountViews !== undefined) patch.privacy_dont_count_views = data.privacyDontCountViews;

    const { error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AvatarUploadInput = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
});

export const getAvatarUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AvatarUploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${context.userId}/${Date.now()}-${safe}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const setAvatarPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ avatar_path: data.path })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
