import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Menu,
  Search,
  Bell,
  Mic,
  X,
  Home,
  Flame,
  Music2,
  Library,
  History,
  Users,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Download,
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Radio,
  ShieldCheck,
  Cpu,
  Upload,
  Ghost,
} from "lucide-react";
import { dtoToVideo, type Video } from "@/lib/opentube-data";
import {
  listVideos,
  getVideoStats,
  getMyLike,
  setLike,
  getSubscriberCount,
  getMySubscription,
  toggleSubscription,
  incrementView,
} from "@/lib/videos.functions";
import { useSession, type SessionState } from "@/hooks/useSession";
import { UserMenu } from "@/components/UserMenu";
import { useP2PVideo } from "@/hooks/useP2PVideo";


import opentubeLogo from "@/assets/opentube-logo.png.asset.json";
import { ProfileGate } from "@/components/ProfileGate";
import { hasEntered } from "@/lib/saved-accounts";

export const Route = createFileRoute("/")({
  component: OpenTubeRoot,
});

function OpenTubeRoot() {
  // SSR renders the main app (crawlers see real content). On the client we
  // flip into the profile gate if the user hasn't picked a profile this tab.
  const [entered, setEntered] = useState<boolean>(true);
  useEffect(() => {
    if (!hasEntered()) setEntered(false);
  }, []);
  if (!entered) return <ProfileGate onEntered={() => setEntered(true)} />;
  return <OpenTube />;
}



const CATEGORIES = [
  "Todos",
  "Privacidad",
  "IA",
  "Descentralización",
  "Seguridad",
  "Software libre",
  "En vivo",
  "Recién subidos",
  "Populares",
];

const NAV_MAIN = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "trending", label: "Tendencias", icon: Flame },
  { id: "subs", label: "Suscripciones", icon: Users },
];
const NAV_YOU = [
  { id: "library", label: "Librería", icon: Library },
  { id: "history", label: "Historial", icon: History },
  { id: "music", label: "Música soberana", icon: Music2 },
];


function OpenTube() {
  const listVideosFn = useServerFn(listVideos);
  const incrementViewFn = useServerFn(incrementView);
  const qc = useQueryClient();
  const session = useSession();
  const dontCountViews = session.profile?.privacyDontCountViews ?? false;

  const { data: rawVideos } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideosFn(),
  });
  const VIDEOS: Video[] = useMemo(
    () => (rawVideos ?? []).map(dtoToVideo),
    [rawVideos],
  );

  const openVideo = (v: Video) => {
    setPlaying(v);
    // Guests can watch but their views are not counted.
    // Authenticated users only count if they haven't opted out in their profile.
    if (session.mode !== "user" || dontCountViews) return;
    incrementViewFn({ data: { videoId: v.id } })
      .then(() => qc.invalidateQueries({ queryKey: ["videos"] }))
      .catch(() => {});
  };

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [activeNav, setActiveNav] = useState("home");
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [playing, setPlaying] = useState<Video | null>(null);
  const [visible, setVisible] = useState(8);

  // Per-identity progress storage: signed-in users → localStorage keyed by user id;
  // guests → sessionStorage (wiped on tab close).
  const progressKey =
    session.mode === "user" ? `opentube:progress:${session.userId}` : "opentube:progress:guest";
  const progressStore: "local" | "session" = session.mode === "user" ? "local" : "session";

  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  // Load progress whenever the identity/key changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storage = progressStore === "local" ? window.localStorage : window.sessionStorage;
      const raw = storage.getItem(progressKey);
      setProgressMap(raw ? (JSON.parse(raw) as Record<string, number>) : {});
    } catch {
      setProgressMap({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storage = progressStore === "local" ? window.localStorage : window.sessionStorage;
      storage.setItem(progressKey, JSON.stringify(progressMap));
    } catch {}
  }, [progressMap, progressKey, progressStore]);

  const updateProgress = (id: string, ratio: number, force = false) => {
    setProgressMap((m) => {
      const prev = m[id] ?? 0;
      const clamped = Math.max(0, Math.min(ratio, 1));
      if (!force && clamped <= prev + 0.001) return m;
      if (clamped === prev) return m;
      return { ...m, [id]: clamped };
    });
  };


  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VIDEOS.filter((v) => {
      if (activeChannel && v.channelName !== activeChannel) return false;
      const catOk =
        activeCategory === "Todos" ||
        v.category === activeCategory ||
        (activeCategory === "En vivo" && false) ||
        (activeCategory === "Recién subidos" && v.uploadedAt.includes("día")) ||
        (activeCategory === "Populares" && v.views.includes("M"));
      if (!catOk) return false;
      if (!q) return true;
      return (
        v.title.toLowerCase().includes(q) ||
        v.channelName.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    });
  }, [VIDEOS, query, activeCategory, activeChannel]);


  const shown = filtered.slice(0, visible);

  // infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisible((v) => Math.min(v + 4, filtered.length));
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  useEffect(() => {
    setVisible(8);
  }, [query, activeCategory, activeChannel]);

  useEffect(() => {
    document.body.style.overflow = playing ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [playing]);

  return (
    <div className="min-h-screen text-foreground" style={{ background: "#0f0f0f" }}>
      <Header
        query={query}
        setQuery={setQuery}
        onMenu={() => setDrawerOpen(true)}
        mobileSearchOpen={mobileSearchOpen}
        setMobileSearchOpen={setMobileSearchOpen}
        session={session}
      />
      {session.mode === "guest" && <GuestBanner alias={session.guest.alias} />}


      <div className="flex pt-14">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto scrollbar-hide py-3">
          <Sidebar
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            activeChannel={activeChannel}
            setActiveChannel={setActiveChannel}
            videos={VIDEOS}
          />

        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setDrawerOpen(false)}
            />
            <aside
              className="relative w-64 h-full overflow-y-auto py-3"
              style={{ background: "#0f0f0f" }}
            >
              <div className="flex items-center gap-4 px-4 h-12 mb-2">
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="h-11 w-11 -ml-2 grid place-items-center rounded-full hover:bg-surface-hover"
                  aria-label="Cerrar menú"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <BrandLogo />
              </div>
              <Sidebar
                activeNav={activeNav}
                setActiveNav={(id) => {
                  setActiveNav(id);
                  setDrawerOpen(false);
                }}
                activeChannel={activeChannel}
                setActiveChannel={(c) => {
                  setActiveChannel(c);
                  setDrawerOpen(false);
                }}
                videos={VIDEOS}
              />

            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0">
          <CategoryBar
            active={activeCategory}
            setActive={setActiveCategory}
          />
          <div className="px-3 sm:px-4 lg:px-6 pb-24">
            {shown.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8 pt-2">
                {shown.map((v) => (
                  <VideoCard
                    key={v.id}
                    video={v}
                    progress={progressMap[v.id] ?? 0}
                    onOpen={() => openVideo(v)}
                  />
                ))}
              </div>
            )}
            <div ref={sentinelRef} className="h-10" />
          </div>
        </main>
      </div>

      {playing && (
        <WatchView
          video={playing}
          allVideos={VIDEOS}
          initialProgress={progressMap[playing.id] ?? 0}
          progressMap={progressMap}
          onProgress={updateProgress}
          onClose={() => setPlaying(null)}
          onSelect={(v) => openVideo(v)}
          session={session}
        />
      )}
    </div>
  );
}

function GuestBanner({ alias }: { alias: string }) {
  return (
    <div
      className="mt-14 flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-2 text-[11px]"
      style={{
        background: "linear-gradient(90deg, rgba(250,204,21,0.08), rgba(250,204,21,0.02))",
        borderBottom: "1px solid #272727",
      }}
    >
      <Ghost className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
      <span className="text-yellow-300/90 font-medium">
        One-time profile activo · <span className="text-muted-foreground font-normal">{alias}</span>
      </span>
      <span className="hidden sm:inline text-muted-foreground">
        · sesión desechable, no se guarda nada al cerrar la pestaña
      </span>
      <Link
        to="/auth"
        className="ml-auto h-7 px-3 rounded-full text-[11px] font-semibold text-black grid place-items-center"
        style={{ background: "#facc15" }}
      >
        Crear cuenta
      </Link>
    </div>
  );
}


/* ---------------- Header ---------------- */

function BrandLogo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <img
        src={opentubeLogo.url}
        alt="OpenTube"
        className="h-8 w-auto object-contain"
      />
      <span className="text-[10px] font-semibold text-muted-foreground tracking-widest hidden sm:inline">
        BETA
      </span>
    </div>
  );
}

function Header({
  query,
  setQuery,
  onMenu,
  mobileSearchOpen,
  setMobileSearchOpen,
  session,
}: {
  query: string;
  setQuery: (s: string) => void;
  onMenu: () => void;
  mobileSearchOpen: boolean;
  setMobileSearchOpen: (b: boolean) => void;
  session: SessionState;
}) {

  return (
    <header
      className="fixed top-0 inset-x-0 z-40 h-14 flex items-center px-2 sm:px-4 gap-2 sm:gap-4"
      style={{ background: "#0f0f0f", borderBottom: "1px solid #272727" }}
    >
      {mobileSearchOpen ? (
        <div className="flex items-center gap-2 w-full md:hidden">
          <button
            onClick={() => setMobileSearchOpen(false)}
            className="h-11 w-11 grid place-items-center rounded-full hover:bg-surface-hover"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 flex items-center h-10 rounded-full border border-border bg-[#121212] px-4">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en OpenTube"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="h-8 w-8 grid place-items-center rounded-full hover:bg-surface-hover"
                aria-label="Limpiar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            className="h-11 w-11 grid place-items-center rounded-full hover:bg-surface-hover"
            aria-label="Búsqueda por voz"
          >
            <Mic className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={onMenu}
            className="h-11 w-11 grid place-items-center rounded-full hover:bg-surface-hover lg:hover:bg-surface-hover"
            aria-label="Menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <BrandLogo />

          <div className="hidden md:flex flex-1 justify-center px-8">
            <div className="flex w-full max-w-2xl">
              <div className="flex-1 flex items-center h-10 rounded-l-full border border-border bg-[#121212] px-4 focus-within:border-[#1c62b9] focus-within:shadow-[inset_0_0_0_1px_#1c62b9]">
                <Search className="h-4 w-4 text-muted-foreground mr-3 hidden [.focus-within_&]:block" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar en OpenTube"
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="h-8 w-8 grid place-items-center rounded-full hover:bg-surface-hover"
                    aria-label="Limpiar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                className="h-10 w-16 grid place-items-center rounded-r-full border border-l-0 border-border bg-surface hover:bg-surface-hover"
                aria-label="Buscar"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
            <button
              className="ml-2 h-10 w-10 grid place-items-center rounded-full bg-surface hover:bg-surface-hover"
              aria-label="Búsqueda por voz"
            >
              <Mic className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setMobileSearchOpen(true)}
              className="md:hidden h-11 w-11 grid place-items-center rounded-full hover:bg-surface-hover"
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              className="md:hidden h-11 w-11 grid place-items-center rounded-full hover:bg-surface-hover"
              aria-label="Búsqueda por voz"
            >
              <Mic className="h-5 w-5" />
            </button>
            <Link
              to={session.mode === "user" ? "/upload" : "/auth"}
              className="h-11 w-11 grid place-items-center rounded-full hover:bg-surface-hover"
              aria-label="Subir video"
              title={session.mode === "user" ? "Subir video" : "Inicia sesión para subir"}
            >
              <Upload className="h-5 w-5" />
            </Link>
            <button
              className="h-11 w-11 grid place-items-center rounded-full hover:bg-surface-hover relative"
              aria-label="Notificaciones"
            >
              <Bell className="h-5 w-5" />
              <span
                className="absolute top-2 right-2 h-2 w-2 rounded-full"
                style={{ background: "#ef4444" }}
              />
            </button>
            <UserMenu session={session} />
          </div>
        </>
      )}
    </header>
  );
}


/* ---------------- Sidebar ---------------- */

function Sidebar({
  activeNav,
  setActiveNav,
  activeChannel,
  setActiveChannel,
  videos,
}: {
  activeNav: string;
  setActiveNav: (id: string) => void;
  activeChannel: string | null;
  setActiveChannel: (c: string | null) => void;
  videos: Video[];
}) {
  const channels = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const v of videos) {
      if (!map.has(v.channelName)) {
        map.set(v.channelName, { name: v.channelName, color: v.channelColor });
      }
    }
    return Array.from(map.values());
  }, [videos]);

  return (
    <nav className="text-sm">
      <NavGroup items={NAV_MAIN} activeNav={activeNav} setActiveNav={setActiveNav} />
      <div className="mx-3 my-2 border-t border-border" />
      <div className="px-6 pt-3 pb-1 text-[13px] font-semibold text-muted-foreground">
        Tú
      </div>
      <NavGroup items={NAV_YOU} activeNav={activeNav} setActiveNav={setActiveNav} />
      <div className="mx-3 my-2 border-t border-border" />
      <div className="px-6 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted-foreground">
          Nodos soberanos
        </span>
        {activeChannel && (
          <button
            onClick={() => setActiveChannel(null)}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </button>
        )}
      </div>
      <div className="px-2">
        {channels.map((c) => {
          const on = activeChannel === c.name;
          return (
            <button
              key={c.name}
              onClick={() => setActiveChannel(on ? null : c.name)}
              aria-pressed={on}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg min-h-11 text-left transition-colors ${
                on ? "bg-surface font-semibold" : "hover:bg-surface"
              }`}
            >
              <span
                className="h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0"
                style={{ background: c.color }}
              >
                {c.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span className="flex-1 truncate">{c.name}</span>


            </button>
          );
        })}
      </div>
      <div className="mx-3 my-3 border-t border-border" />
      <div className="px-6 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground/80">Red descentralizada</span>
        </div>
        Sin telemetría. Sin anuncios. Tus datos permanecen en tu nodo.
      </div>
    </nav>
  );
}

function NavGroup({
  items,
  activeNav,
  setActiveNav,
}: {
  items: { id: string; label: string; icon: typeof Home }[];
  activeNav: string;
  setActiveNav: (id: string) => void;
}) {
  return (
    <div className="px-2">
      {items.map((it) => {
        const Icon = it.icon;
        const active = activeNav === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setActiveNav(it.id)}
            className={`w-full flex items-center gap-6 px-4 py-2.5 rounded-lg min-h-11 text-left transition-colors ${
              active ? "bg-surface font-semibold" : "hover:bg-surface"
            }`}
          >
            <Icon
              className="h-6 w-6 shrink-0"
              strokeWidth={active ? 2.4 : 1.8}
            />
            <span className="truncate">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Category Bar ---------------- */

function CategoryBar({
  active,
  setActive,
}: {
  active: string;
  setActive: (s: string) => void;
}) {
  return (
    <div
      className="sticky top-14 z-30 px-3 sm:px-4 lg:px-6 py-3 flex gap-3 overflow-x-auto scrollbar-hide"
      style={{ background: "#0f0f0f" }}
    >
      {CATEGORIES.map((c) => {
        const on = c === active;
        return (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`shrink-0 min-h-9 px-3 rounded-lg text-sm font-medium transition-colors border ${
              on
                ? "bg-white text-[#0f0f0f] border-white"
                : "bg-surface text-foreground border-transparent hover:bg-surface-hover"
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Video card ---------------- */

function VideoCard({
  video,
  progress,
  onOpen,
}: {
  video: Video;
  progress: number;
  onOpen: () => void;
}) {
  const pct = Math.round(progress * 100);
  const watched = pct > 0;
  return (
    <button
      onClick={onOpen}
      className="text-left group flex flex-col gap-3 rounded-xl transition-transform"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl">
        <div
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]"
          style={{ background: video.gradient }}
        />
        {video.thumbnailUrl && (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 60%)",
          }}
        />

        <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="h-14 w-14 rounded-full grid place-items-center bg-black/60 backdrop-blur">
            <Play className="h-6 w-6 text-white fill-white" />
          </span>
        </div>
        <span
          className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[11px] font-medium text-white"
          style={{ background: "rgba(0,0,0,0.8)" }}
        >
          {video.duration}
        </span>
        {watched && (
          <div
            className="absolute inset-x-0 bottom-0 h-[3px]"
            style={{ background: "rgba(255,255,255,0.25)" }}
          >
            <div
              className="h-full"
              style={{ width: `${pct}%`, background: "#ef4444" }}
            />
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <span
          className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-xs font-bold"
          style={{ background: video.channelColor }}
        >
          {video.channelInitials}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug line-clamp-2">
            {video.title}
          </h3>
          <div className="mt-1 text-[13px] text-muted-foreground truncate">
            {video.channelName}
          </div>
          <div className="text-[13px] text-muted-foreground truncate">
            {video.views} · {video.uploadedAt}
            {watched && (
              <>
                {" · "}
                <span style={{ color: "#ef4444" }}>{pct}% visto</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------------- Empty state ---------------- */

function EmptyState() {
  return (
    <div className="py-24 flex flex-col items-center text-center">
      <div
        className="h-20 w-20 rounded-full grid place-items-center mb-4"
        style={{ background: "#121212", border: "1px solid #272727" }}
      >
        <Radio className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">
        No se encontraron videos soberanos
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Ningún nodo de la red coincide con tu búsqueda. Prueba otro término o
        cambia de categoría.
      </p>
    </div>
  );
}

/* ---------------- Watch View ---------------- */

function WatchView({
  video,
  allVideos,
  initialProgress,
  progressMap,
  onProgress,
  onClose,
  onSelect,
  session,
}: {
  video: Video;
  allVideos: Video[];
  initialProgress: number;
  progressMap: Record<string, number>;
  onProgress: (id: string, ratio: number, force?: boolean) => void;
  onClose: () => void;
  onSelect: (v: Video) => void;
  session: SessionState;
}) {
  const qc = useQueryClient();
  const statsFn = useServerFn(getVideoStats);
  const myLikeFn = useServerFn(getMyLike);
  const setLikeFn = useServerFn(setLike);
  const subCountFn = useServerFn(getSubscriberCount);
  const mySubFn = useServerFn(getMySubscription);
  const toggleSubFn = useServerFn(toggleSubscription);

  const authed = session.mode === "user";


  const statsQ = useQuery({
    queryKey: ["video-stats", video.id],
    queryFn: () => statsFn({ data: { videoId: video.id } }),
  });
  const myLikeQ = useQuery({
    queryKey: ["my-like", video.id, authed],
    queryFn: () => myLikeFn({ data: { videoId: video.id } }),
    enabled: authed,
  });
  const subCountQ = useQuery({
    queryKey: ["sub-count", video.channelName],
    queryFn: () => subCountFn({ data: { channelName: video.channelName } }),
  });
  const mySubQ = useQuery({
    queryKey: ["my-sub", video.channelName, authed],
    queryFn: () => mySubFn({ data: { channelName: video.channelName } }),
    enabled: authed,
  });

  const likeMut = useMutation({
    mutationFn: (v: -1 | 0 | 1) => setLikeFn({ data: { videoId: video.id, value: v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-stats", video.id] });
      qc.invalidateQueries({ queryKey: ["my-like", video.id] });
    },
  });
  const subMut = useMutation({
    mutationFn: () => toggleSubFn({ data: { channelName: video.channelName } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sub-count", video.channelName] });
      qc.invalidateQueries({ queryKey: ["my-sub", video.channelName] });
    },
  });

  const myLike = myLikeQ.data?.value ?? 0;
  const state: "up" | "down" | null = myLike === 1 ? "up" : myLike === -1 ? "down" : null;
  const likeCount = statsQ.data?.likes ?? 0;
  const dislikeCount = statsQ.data?.dislikes ?? 0;
  const subscribed = !!mySubQ.data?.subscribed;
  const subCount = subCountQ.data?.count ?? 0;

  const clickLike = (target: "up" | "down") => {
    if (!authed) return;
    const desired: -1 | 0 | 1 = target === "up"
      ? (state === "up" ? 0 : 1)
      : (state === "down" ? 0 : -1);
    likeMut.mutate(desired);
  };

  const related = allVideos.filter((v) => v.id !== video.id).slice(0, 8);

  const continueWatching = allVideos.filter((v) => {
    if (v.id === video.id) return false;
    const p = progressMap[v.id] ?? 0;
    return p > 0.02 && p < 0.97;
  })
    .sort((a, b) => (progressMap[b.id] ?? 0) - (progressMap[a.id] ?? 0))
    .slice(0, 6);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);


  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center px-0 sm:px-4 py-0 sm:py-8"
      style={{
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[1200px] sm:rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ background: "#0f0f0f", border: "1px solid #272727" }}
      >
        {/* Close button — floating over the player */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 h-11 w-11 grid place-items-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <CustomPlayer
          video={video}
          initialProgress={initialProgress}
          onProgress={onProgress}
          authed={authed}
        />

        <div className="p-4 sm:p-6">
          <h1 className="text-lg sm:text-2xl font-bold leading-snug">
            {video.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="h-10 w-10 rounded-full grid place-items-center text-sm font-bold"
                style={{ background: video.channelColor }}
              >
                {video.channelInitials}
              </span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{video.channelName}</div>
                <div className="text-xs text-muted-foreground">
                  {subCount.toLocaleString("es")}{" "}
                  {subCount === 1 ? "suscriptor" : "suscriptores"} · canal
                </div>
              </div>
              <button
                onClick={() => authed && subMut.mutate()}
                disabled={!authed || subMut.isPending}
                title={authed ? "" : "Inicia sesión para suscribirte"}
                className={`ml-2 h-10 px-4 rounded-full text-sm font-semibold transition-colors disabled:opacity-60 ${
                  subscribed
                    ? "bg-surface text-foreground hover:bg-surface-hover"
                    : "bg-white text-[#0f0f0f] hover:bg-white/90"
                }`}
              >
                {subscribed ? "Suscrito" : "Suscribirse"}
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <div className="flex items-center rounded-full bg-surface overflow-hidden">
                <button
                  onClick={() => clickLike("up")}
                  disabled={!authed || likeMut.isPending}
                  title={authed ? "" : "Inicia sesión para reaccionar"}
                  className="flex items-center gap-2 h-10 px-4 hover:bg-surface-hover min-w-11 disabled:opacity-60"
                >
                  <ThumbsUp
                    className="h-5 w-5"
                    fill={state === "up" ? "currentColor" : "none"}
                  />
                  <span className="text-sm font-medium">
                    {likeCount.toLocaleString("es")}
                  </span>
                </button>
                <span className="w-px h-6 bg-border" />
                <button
                  onClick={() => clickLike("down")}
                  disabled={!authed || likeMut.isPending}
                  title={authed ? "" : "Inicia sesión para reaccionar"}
                  className="flex items-center gap-2 h-10 px-4 hover:bg-surface-hover min-w-11 disabled:opacity-60"
                  aria-label="No me gusta"
                >
                  <ThumbsDown
                    className="h-5 w-5"
                    fill={state === "down" ? "currentColor" : "none"}
                  />
                  <span className="text-sm font-medium">
                    {dislikeCount.toLocaleString("es")}
                  </span>
                </button>
              </div>

              <button className="flex items-center gap-2 h-10 px-4 rounded-full bg-surface hover:bg-surface-hover text-sm font-medium">
                <Share2 className="h-5 w-5" /> Compartir
              </button>
              <button className="flex items-center gap-2 h-10 px-4 rounded-full bg-surface hover:bg-surface-hover text-sm font-medium">
                <Download className="h-5 w-5" /> Guardar
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl p-4 bg-card">
            <div className="text-sm font-semibold mb-1">
              {video.views} · {video.uploadedAt}
            </div>
            <p className="text-sm text-foreground/90 whitespace-pre-line">
              {video.description}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              WebRTC P2P · señalización híbrida · datos cifrados en el dispositivo
            </div>
          </div>

          {continueWatching.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="h-4 w-4" style={{ color: "#ef4444" }} />
                <div className="text-sm font-semibold">Sigue viendo</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {continueWatching.map((v) => {
                  const p = progressMap[v.id] ?? 0;
                  const pct = Math.round(p * 100);
                  return (
                    <button
                      key={v.id}
                      onClick={() => onSelect(v)}
                      className="flex gap-3 text-left group items-center rounded-lg p-2 hover:bg-surface transition-colors"
                    >
                      <div className="relative w-32 aspect-video rounded-md overflow-hidden shrink-0">
                        <div
                          className="absolute inset-0"
                          style={{ background: v.gradient }}
                        />
                        {v.thumbnailUrl && (
                          <img
                            src={v.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}

                        <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="h-5 w-5 text-white" fill="white" />
                        </div>
                        <div
                          className="absolute inset-x-0 bottom-0 h-[3px]"
                          style={{ background: "rgba(255,255,255,0.25)" }}
                        >
                          <div
                            className="h-full"
                            style={{ width: `${pct}%`, background: "#ef4444" }}
                          />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold line-clamp-2 leading-snug">
                          {v.title}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          {v.channelName}
                        </div>
                        <div className="text-xs" style={{ color: "#ef4444" }}>
                          Retomar al {pct}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-8">
            <div className="text-sm font-semibold mb-3 text-muted-foreground">
              A continuación
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {related.map((v) => {
                const p = progressMap[v.id] ?? 0;
                const pct = Math.round(p * 100);
                return (
                  <button
                    key={v.id}
                    onClick={() => onSelect(v)}
                    className="flex gap-3 text-left group items-start"
                  >
                    <div className="relative w-32 sm:w-full sm:aspect-video aspect-video rounded-lg overflow-hidden shrink-0">
                      <div
                        className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.05]"
                        style={{ background: v.gradient }}
                      />
                      {v.thumbnailUrl && (
                        <img
                          src={v.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                        />
                      )}

                      <span
                        className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[10px] font-medium text-white"
                        style={{ background: "rgba(0,0,0,0.8)" }}
                      >
                        {v.duration}
                      </span>
                      {pct > 0 && (
                        <div
                          className="absolute inset-x-0 bottom-0 h-[3px]"
                          style={{ background: "rgba(255,255,255,0.25)" }}
                        >
                          <div
                            className="h-full"
                            style={{ width: `${pct}%`, background: "#ef4444" }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 sm:mt-2">
                      <div className="text-sm font-semibold line-clamp-2 leading-snug">
                        {v.title}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate">
                        {v.channelName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {v.views} · {v.uploadedAt}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Custom Player ---------------- */

function CustomPlayer({
  video,
  initialProgress,
  onProgress,
  authed,
}: {
  video: Video;
  initialProgress: number;
  onProgress: (id: string, ratio: number, force?: boolean) => void;
  authed: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hovering, setHovering] = useState(false);

  // Real P2P layer: local encrypted cache + seeder announcement + peer count.
  const eligibleForCache = video.sourceKind !== "embed" && !!video.videoUrl;
  const p2p = useP2PVideo({
    videoId: video.id,
    originUrl: video.videoUrl,
    mimeType: video.mimeType,
    authed,
    eligibleSource: eligibleForCache,
  });

  // On video change: seek to stored progress (unless near end) and autoplay.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const d = el.duration || 0;
      const resumeAt = initialProgress > 0 && initialProgress < 0.97 ? initialProgress * d : 0;
      if (d) el.currentTime = resumeAt;
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener("loadedmetadata", apply, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const onTime = () => {
    const el = ref.current;
    if (!el) return;
    const d = el.duration || 0;
    setProgress(el.currentTime);
    setDuration(d);
    if (d > 0) onProgress(video.id, el.currentTime / d);
  };


  const barRef = useRef<HTMLDivElement | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const applySeek = (clientX: number) => {
    const el = ref.current;
    const bar = barRef.current;
    if (!el || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setProgress(el.currentTime);
    onProgress(video.id, ratio, true);
  };

  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setScrubbing(true);
    applySeek(e.clientX);
  };
  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    applySeek(e.clientX);
  };
  const onBarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    setScrubbing(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const fs = () => {
    ref.current?.parentElement?.requestFullscreen?.();
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  if (video.sourceKind === "embed") {
    return (
      <div
        className="relative w-full aspect-video overflow-hidden lg:rounded-xl bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          src={video.videoUrl}
          title={video.title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      className="relative w-full aspect-video overflow-hidden lg:rounded-xl"
      style={{ background: video.gradient }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={toggle}
    >
      <video
        ref={ref}
        src={p2p.playbackUrl}
        poster={video.thumbnailUrl ?? undefined}
        muted={muted}
        playsInline
        loop
        onTimeUpdate={onTime}
        onLoadedMetadata={onTime}
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div
        className={`absolute inset-x-0 bottom-0 p-3 flex flex-col gap-2 transition-opacity ${
          hovering || !playing ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={barRef}
          className="h-2 w-full rounded-full cursor-pointer group flex items-center touch-none"
          style={{ background: "rgba(255,255,255,0.25)" }}
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="h-full rounded-full relative pointer-events-none"
            style={{
              width: `${duration ? (progress / duration) * 100 : 0}%`,
              background: "#ef4444",
            }}
          >
            <span
              className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3.5 w-3.5 rounded-full bg-white transition-opacity ${
                scrubbing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-white">
          <button
            onClick={toggle}
            className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10"
            aria-label={playing ? "Pausar" : "Reproducir"}
          >
            {playing ? (
              <Pause className="h-5 w-5" fill="white" />
            ) : (
              <Play className="h-5 w-5" fill="white" />
            )}
          </button>
          <button
            onClick={() => setMuted((m) => !m)}
            className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10"
            aria-label={muted ? "Activar sonido" : "Silenciar"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <span className="text-xs font-medium">
            {fmt(progress)} / {fmt(duration)}
          </span>
          <span
            className="ml-auto flex items-center gap-1 text-[11px] px-2 py-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.5)" }}
            title={
              p2p.cache.phase === "cached"
                ? `Reproduciendo desde caché local cifrada · ${p2p.peers} par(es) en el enjambre`
                : p2p.cache.phase === "downloading"
                  ? `Descargando y cifrando en el dispositivo (${Math.round(
                      (p2p.cache.received / Math.max(1, p2p.cache.total)) * 100,
                    )}%)`
                  : p2p.cache.phase === "error"
                    ? `Caché local no disponible: ${p2p.cache.message}`
                    : eligibleForCache
                      ? authed
                        ? "Preparando caché local cifrada"
                        : "Inicia sesión para cachear y sembrar"
                      : "Fuente embebida — no cacheable"
            }
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  p2p.cache.phase === "cached"
                    ? "#10b981"
                    : p2p.cache.phase === "downloading"
                      ? "#f59e0b"
                      : p2p.cache.phase === "error"
                        ? "#ef4444"
                        : "#6b7280",
              }}
            />
            {p2p.seeding ? "Seed" : "P2P"} · {p2p.peers}{" "}
            {p2p.peers === 1 ? "par" : "pares"}
          </span>
          <button
            onClick={fs}
            className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10"
            aria-label="Pantalla completa"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
