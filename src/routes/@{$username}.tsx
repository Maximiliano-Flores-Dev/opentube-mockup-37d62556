import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BellRing, Bell, Play } from "lucide-react";
import { getProfileByChannel } from "@/lib/profile.functions";
import {
  listVideos,
  getSubscriberCount,
  getMySubscription,
  toggleSubscription,
} from "@/lib/videos.functions";
import { dtoToVideo } from "@/lib/opentube-data";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/@{$username}")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} · OpenTube` },
      {
        name: "description",
        content: `Canal de @${params.username} en OpenTube: vídeos, suscriptores y últimas subidas.`,
      },
      { property: "og:title", content: `@${params.username} · OpenTube` },
      {
        property: "og:description",
        content: `Canal de @${params.username} en OpenTube.`,
      },
    ],
  }),
  component: ChannelPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center text-foreground" style={{ background: "#0f0f0f" }}>
      <div className="text-center space-y-3">
        <p className="text-lg font-semibold">No se pudo cargar este canal</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Link to="/" className="inline-block text-sm underline">Volver al inicio</Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center text-foreground" style={{ background: "#0f0f0f" }}>
      <div className="text-center space-y-3">
        <p className="text-lg font-semibold">Canal no encontrado</p>
        <Link to="/" className="inline-block text-sm underline">Volver al inicio</Link>
      </div>
    </div>
  ),
});

function ChannelPage() {
  const { username } = Route.useParams();
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const getProfileFn = useServerFn(getProfileByChannel);
  const listVideosFn = useServerFn(listVideos);
  const getSubCountFn = useServerFn(getSubscriberCount);
  const getMySubFn = useServerFn(getMySubscription);
  const toggleSubFn = useServerFn(toggleSubscription);

  const profileQuery = useQuery({
    queryKey: ["profile", "channel", username],
    queryFn: () => getProfileFn({ data: { channelName: username } }),
  });

  const videosQuery = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideosFn(),
  });

  const subCountQuery = useQuery({
    queryKey: ["subscribers", username],
    queryFn: () => getSubCountFn({ data: { channelName: username } }),
  });

  const mySubQuery = useQuery({
    queryKey: ["my-subscription", username, session.mode],
    queryFn: () => getMySubFn({ data: { channelName: username } }),
    enabled: session.mode === "user",
  });

  const subMutation = useMutation({
    mutationFn: () => toggleSubFn({ data: { channelName: username } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscribers", username] });
      qc.invalidateQueries({ queryKey: ["my-subscription", username] });
    },
  });

  const channelVideos = useMemo(() => {
    return (videosQuery.data ?? [])
      .filter((v) => v.channelName === username)
      .map(dtoToVideo);
  }, [videosQuery.data, username]);

  const subscribed = mySubQuery.data?.subscribed ?? false;
  const subCount = subCountQuery.data?.count ?? 0;
  const profile = profileQuery.data;

  const initials =
    profile?.channelInitials ||
    username
      .split(/\s+/)
      .map((w: string) => w[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "??";
  const color = profile?.channelColor || "#334155";

  const handleSubscribe = () => {
    if (session.mode !== "user") {
      navigate({ to: "/auth" });
      return;
    }
    subMutation.mutate();
  };

  return (
    <div className="min-h-screen text-foreground" style={{ background: "#0f0f0f" }}>
      <header
        className="sticky top-0 z-30 h-14 flex items-center gap-3 px-3 sm:px-4"
        style={{ background: "#0f0f0f", borderBottom: "1px solid #272727" }}
      >
        <Link
          to="/"
          className="h-10 w-10 grid place-items-center rounded-full hover:bg-surface-hover"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold truncate">@{username}</h1>
      </header>

      <section className="px-3 sm:px-6 pt-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={`Avatar de ${username}`}
              className="h-24 w-24 sm:h-32 sm:w-32 rounded-full object-cover"
            />
          ) : (
            <div
              className="h-24 w-24 sm:h-32 sm:w-32 rounded-full grid place-items-center text-3xl font-semibold text-white"
              style={{ background: color }}
              aria-hidden
            >
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-2xl sm:text-3xl font-bold truncate">
              {profile?.displayName || `@${username}`}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              @{username} · {subCount.toLocaleString("es")} suscriptor{subCount === 1 ? "" : "es"} · {channelVideos.length} vídeo{channelVideos.length === 1 ? "" : "s"}
            </p>
            {profile?.bio && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2 max-w-2xl">
                {profile.bio}
              </p>
            )}

            <div className="mt-4">
              <button
                onClick={handleSubscribe}
                disabled={subMutation.isPending}
                className="h-10 px-5 rounded-full text-sm font-semibold inline-flex items-center gap-2 transition disabled:opacity-60"
                style={
                  subscribed
                    ? { background: "#272727", color: "#fff" }
                    : { background: "#fff", color: "#0f0f0f" }
                }
                aria-pressed={subscribed}
              >
                {subscribed ? (
                  <>
                    <BellRing className="h-4 w-4" />
                    Suscrito
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Suscribirse
                  </>
                )}
              </button>
              {session.mode !== "user" && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Inicia sesión para suscribirte.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-[#272727]" />

      <section className="px-3 sm:px-6 py-6">
        <h3 className="text-lg font-semibold mb-4">Vídeos</h3>
        {videosQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : channelVideos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este canal aún no ha publicado vídeos.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8">
            {channelVideos.map((v) => (
              <Link
                key={v.id}
                to="/"
                className="group block"
                aria-label={`Ver ${v.title}`}
              >
                <div
                  className="relative aspect-video w-full rounded-xl overflow-hidden"
                  style={{ background: v.gradient }}
                >
                  {v.thumbnailUrl && (
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition bg-black/30">
                    <Play className="h-10 w-10 text-white" />
                  </div>
                  <span
                    className="absolute bottom-2 right-2 text-[11px] px-1.5 py-0.5 rounded font-medium text-white"
                    style={{ background: "rgba(0,0,0,0.75)" }}
                  >
                    {v.duration}
                  </span>
                </div>
                <div className="mt-2">
                  <p className="text-sm font-medium line-clamp-2">{v.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {v.views} · {v.uploadedAt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
