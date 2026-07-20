import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkAdmin,
  claimAdmin,
  createVideo,
  getUploadUrl,
} from "@/lib/videos.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { analyzeUrl } from "@/lib/embed-detect";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Upload, ShieldCheck, LogOut, Youtube, Link as LinkIcon, FileVideo } from "lucide-react";


export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
  head: () => ({
    meta: [
      { title: "Subir video — OpenTube" },
      { name: "description", content: "Panel de administración para subir videos a OpenTube." },
    ],
  }),
});

const CATEGORIES = [
  "Privacidad",
  "IA",
  "Descentralización",
  "Seguridad",
  "Software libre",
  "General",
];
const GRADIENTS = [
  "linear-gradient(135deg, #1a0f2e 0%, #3d1d5c 45%, #e11d48 100%)",
  "linear-gradient(135deg, #0b1e3f 0%, #1e40af 50%, #06b6d4 100%)",
  "linear-gradient(135deg, #052e16 0%, #14532d 50%, #22c55e 100%)",
  "linear-gradient(135deg, #1c1917 0%, #78350f 55%, #f59e0b 100%)",
  "linear-gradient(135deg, #1e1b4b 0%, #6d28d9 55%, #ec4899 100%)",
  "linear-gradient(135deg, #0f172a 0%, #7c2d12 55%, #f97316 100%)",
];

async function extractThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    v.onloadedmetadata = () => {
      const target = Math.min(Math.max((v.duration || 0) * 0.1, 0.1), 3);
      v.currentTime = target;
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth || 640;
        const h = v.videoHeight || 360;
        const maxW = 1280;
        const scale = Math.min(1, maxW / w);
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(v, 0, 0, cw, ch);
        canvas.toBlob((b) => {
          cleanup();
          resolve(b);
        }, "image/jpeg", 0.82);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    v.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}



function UploadPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const check = useServerFn(checkAdmin);
  const claim = useServerFn(claimAdmin);
  const upload = useServerFn(createVideo);
  const getUrl = useServerFn(getUploadUrl);
  const getProfile = useServerFn(getMyProfile);

  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => check() });
  const profileQ = useQuery({
    queryKey: ["my-profile-upload"],
    queryFn: () => getProfile(),
    staleTime: 30_000,
  });

  const [source, setSource] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const analysis = useMemo(() => (source === "url" ? analyzeUrl(videoUrl) : null), [source, videoUrl]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [duration, setDuration] = useState("");
  const [gradient, setGradient] = useState(GRADIENTS[0]);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-detect duration from file
  useEffect(() => {
    if (!file) return;
    const el = document.createElement("video");
    el.preload = "metadata";
    el.src = URL.createObjectURL(file);
    el.onloadedmetadata = () => {
      const secs = Math.round(el.duration);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setDuration(`${m}:${s.toString().padStart(2, "0")}`);
      URL.revokeObjectURL(el.src);
    };
  }, [file]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  // === Admin claim flow (hash-in-DOM + external oracle) ===
  // Endpoint del oráculo. Configúralo con VITE_ADMIN_ORACLE_URL en .env.
  // No hay URL por defecto: un oráculo simulado no cumple el modelo de producción.
  const ORACLE_URL = import.meta.env.VITE_ADMIN_ORACLE_URL as string | undefined;
  const oracleConfigured = !!ORACLE_URL;

  const [rejected, setRejected] = useState(false);

  /**
   * Extrae el hash efímero del DOM. NO se lee de la URL — se busca el primer
   * <p data-opentube-hash> o #opentube-admin-hash del documento y se raspa su
   * texto plano. Se soporta también un contenedor HTML mínimo servido aparte
   * (data-opentube-hash-src="/ruta") que se descarga y parsea en memoria.
   */
  async function extractHashFromDom(): Promise<string | null> {
    const clean = (s: string | null | undefined) =>
      (s ?? "").replace(/[^A-Za-z0-9]/g, "").trim() || null;

    const local =
      document.querySelector<HTMLElement>("p[data-opentube-hash]") ??
      document.querySelector<HTMLElement>("#opentube-admin-hash");
    if (local?.textContent) {
      const v = clean(local.textContent);
      if (v) return v;
    }

    const remoteSrc = document
      .querySelector<HTMLElement>("[data-opentube-hash-src]")
      ?.getAttribute("data-opentube-hash-src");
    if (remoteSrc) {
      try {
        const res = await fetch(remoteSrc, { credentials: "omit", cache: "no-store" });
        if (res.ok) {
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const p =
            doc.querySelector("p[data-opentube-hash]") ??
            doc.querySelector("#opentube-admin-hash") ??
            doc.querySelector("p");
          const v = clean(p?.textContent ?? null);
          if (v) return v;
        }
      } catch {
        /* swallow, caller trata como null */
      }
    }
    return null;
  }

  async function askOracle(hash: string): Promise<boolean> {
    if (!ORACLE_URL) return false;
    const res = await fetch(ORACLE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ hash }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return data?.ok === true;
  }

  async function hardResetAndReload() {
    try {
      await supabase.auth.signOut();
    } catch {
      /* noop */
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* noop */
    }
    window.location.replace("/");
  }

  async function claimHandler() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const hash = await extractHashFromDom();
      if (!hash) {
        setRejected(true);
        return;
      }
      const ok = await askOracle(hash);
      if (!ok) {
        setRejected(true);
        return;
      }
      // SEGURIDAD: idealmente el oráculo debería validarse dentro de la server
      // function `claimAdmin`, no en el cliente. Aquí sólo elevamos si el
      // servidor también acepta (RLS + user_roles siguen siendo la verdad).
      const r = await claim();
      if (r.claimed) {
        setMessage("¡Ahora eres administrador!");
        qc.invalidateQueries({ queryKey: ["is-admin"] });
      } else {
        setRejected(true);
      }
    } catch {
      setRejected(true);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    try {
      let storagePath: string | undefined;
      let externalUrl: string | undefined;
      let thumbnailPath: string | undefined;
      let thumbnailUrlRemote: string | undefined;
      let mimeType = "video/mp4";
      let sourceKind: "file" | "url" | "embed" = "file";
      let embedProvider: "youtube" | "vimeo" | undefined;
      let embedVideoId: string | undefined;

      if (source === "file") {
        if (!file) throw new Error("Selecciona un archivo de video");
        const allowed = ["video/mp4", "video/webm", "video/quicktime"];
        const t = file.type || (file.name.endsWith(".mov") ? "video/quicktime" : "");
        if (!allowed.includes(t)) {
          throw new Error("Formato no permitido. Usa .mp4, .webm o .mov");
        }
        mimeType = t;
        sourceKind = "file";

        // 1) Generate thumbnail from a mid-video frame
        try {
          const thumbBlob = await extractThumbnail(file);
          if (thumbBlob) {
            const thumbName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
            const { path: tPath, signedUrl: tUrl } = await getUrl({
              data: { filename: thumbName, contentType: "image/jpeg", kind: "thumbnail" },
            });
            const putThumb = await fetch(tUrl, {
              method: "PUT",
              headers: { "Content-Type": "image/jpeg" },
              body: thumbBlob,
            });
            if (putThumb.ok) thumbnailPath = tPath;
          }
        } catch (err) {
          console.warn("Thumbnail generation failed:", err);
        }

        // 2) Upload the video
        const { path, signedUrl } = await getUrl({
          data: { filename: file.name, contentType: t, kind: "video" },
        });
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", signedUrl);
          xhr.setRequestHeader("Content-Type", t);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setProgress(ev.loaded / ev.total);
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed: ${xhr.status}`));
          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.send(file);
        });
        storagePath = path;
      } else {
        if (!videoUrl) throw new Error("Ingresa una URL de video");
        const a = analyzeUrl(videoUrl);
        if (a.kind === "embed") {
          sourceKind = "embed";
          embedProvider = a.provider;
          embedVideoId = a.videoId;
          if (a.thumbnailUrl) thumbnailUrlRemote = a.thumbnailUrl;
          mimeType = "text/html"; // embed marker
        } else if (a.kind === "url") {
          sourceKind = "url";
          externalUrl = videoUrl;
          mimeType = a.mimeType;
        } else {
          throw new Error("URL no reconocida.");
        }
      }

      await upload({
        data: {
          title,
          description,
          category,
          duration: duration || "0:00",
          gradient,
          sourceKind,
          videoUrl: sourceKind === "file" ? undefined : undefined,
          storagePath,
          externalUrl,
          embedProvider,
          embedVideoId,
          mimeType,
          thumbnailPath,
          thumbnailUrl: thumbnailUrlRemote,
        },
      });

      setMessage("Video publicado en la red.");
      setFile(null);
      setVideoUrl("");
      setTitle("");
      setDescription("");
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["videos"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }


  if (adminQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground" style={{ background: "#0f0f0f" }}>
        Verificando permisos...
      </div>
    );
  }

  if (!adminQ.data?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0f0f0f" }}>
        <div className="max-w-sm w-full rounded-2xl p-6" style={{ background: "#151515", border: "1px solid #272727" }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-yellow-400" />
            <h1 className="text-lg font-semibold">Acceso restringido</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Solo los administradores pueden subir videos. Si eres el primer usuario de este nodo, puedes reclamar el rol.
          </p>
          {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
          {message && <div className="mt-3 text-xs text-emerald-400">{message}</div>}
          {!oracleConfigured && (
            <div className="mt-3 text-xs text-red-400 leading-relaxed">
              Oráculo de administrador no configurado. Define <code className="text-foreground">VITE_ADMIN_ORACLE_URL</code> para habilitar el reclamo.
            </div>
          )}
          <button
            onClick={claimHandler}
            disabled={busy || !oracleConfigured}
            className="mt-4 w-full h-10 rounded-lg font-semibold text-black disabled:opacity-60"
            style={{ background: "#facc15" }}
          >
            Reclamar rol de admin
          </button>
          <div className="mt-3 flex gap-2">
            <Link to="/" className="flex-1 text-center text-xs h-9 grid place-items-center rounded-lg border border-[#272727]">
              Volver
            </Link>
            <button onClick={signOut} className="flex-1 text-xs h-9 rounded-lg border border-[#272727]">
              Cerrar sesión
            </button>
          </div>
        </div>
        {rejected && <RejectionModal onClose={hardResetAndReload} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0f0f0f" }}>
      <header className="h-14 flex items-center gap-3 px-4 border-b" style={{ borderColor: "#272727" }}>
        <Link to="/" className="h-10 w-10 grid place-items-center rounded-full hover:bg-[#1a1a1a]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-semibold">Subir video</h1>
        <button
          onClick={signOut}
          className="ml-auto text-xs flex items-center gap-1 h-9 px-3 rounded-lg border border-[#272727] hover:bg-[#1a1a1a]"
        >
          <LogOut className="h-3.5 w-3.5" /> Salir
        </button>
      </header>

      <form onSubmit={submit} className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSource("file")}
            className={`flex-1 h-10 rounded-lg text-sm font-medium border ${
              source === "file" ? "bg-white text-black border-white" : "border-[#272727]"
            }`}
          >
            Subir archivo
          </button>
          <button
            type="button"
            onClick={() => setSource("url")}
            className={`flex-1 h-10 rounded-lg text-sm font-medium border ${
              source === "url" ? "bg-white text-black border-white" : "border-[#272727]"
            }`}
          >
            URL externa
          </button>
        </div>

        {source === "file" ? (
          <label
            className="block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer hover:border-yellow-400 transition-colors"
            style={{ borderColor: file ? "#facc15" : "#272727" }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm">
              {file ? file.name : "Elige un archivo .mp4, .webm o .mov"}
            </div>
            {file && (
              <div className="text-xs text-muted-foreground mt-1">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </div>
            )}
          </label>
        ) : (
          <div className="space-y-2">
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=…  ·  https://vimeo.com/…  ·  https://cdn.tu-nodo.io/video.mp4"
              className="w-full h-11 rounded-lg bg-[#151515] border border-[#272727] px-3 text-sm outline-none focus:border-yellow-400"
            />
            {analysis && videoUrl && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {analysis.kind === "embed" ? (
                  <>
                    <Youtube className="h-3.5 w-3.5 text-red-500" />
                    <span>
                      Detectado embed de <b className="text-white">{analysis.provider}</b> · id{" "}
                      <code>{analysis.videoId}</code>
                    </span>
                  </>
                ) : analysis.kind === "url" ? (
                  <>
                    <LinkIcon className="h-3.5 w-3.5 text-emerald-400" />
                    <span>
                      Stream directo · <code>{analysis.mimeType}</code>
                    </span>
                  </>
                ) : (
                  <>
                    <FileVideo className="h-3.5 w-3.5 text-amber-400" />
                    <span>URL no reconocida</span>
                  </>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Soporta enlaces directos <code>.mp4 / .webm / .mov / .m3u8</code> y embeds de YouTube y Vimeo. Ideal para archivos pesados alojados en tu propio nodo o CDN.
            </p>
          </div>
        )}


        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          className="w-full h-11 rounded-lg bg-[#151515] border border-[#272727] px-3 text-sm outline-none focus:border-yellow-400"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción"
          rows={3}
          className="w-full rounded-lg bg-[#151515] border border-[#272727] px-3 py-2 text-sm outline-none focus:border-yellow-400"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-11 flex items-center gap-2 rounded-lg bg-[#151515] border border-[#272727] px-3">
            {profileQ.data ? (
              <>
                <span
                  className="h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold text-black"
                  style={{ background: profileQ.data.channelColor }}
                >
                  {profileQ.data.channelInitials}
                </span>
                <span className="text-sm truncate">{profileQ.data.channelName}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Cargando perfil…</span>
            )}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 rounded-lg bg-[#151515] border border-[#272727] px-3 text-sm outline-none focus:border-yellow-400"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Miniatura (gradiente)</label>
          <div className="mt-1 grid grid-cols-6 gap-2">
            {GRADIENTS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradient(g)}
                className={`aspect-video rounded-lg transition-transform ${gradient === g ? "ring-2 ring-yellow-400" : ""}`}
                style={{ background: g }}
                aria-label="Elegir gradiente"
              />
            ))}
          </div>
        </div>

        {progress !== null && (
          <div className="h-2 rounded-full bg-[#272727] overflow-hidden">
            <div
              className="h-full bg-yellow-400 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {error && <div className="text-xs text-red-400">{error}</div>}
        {message && <div className="text-xs text-emerald-400">{message}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-lg font-semibold text-black disabled:opacity-60"
          style={{ background: "#facc15" }}
        >
          {busy ? "Publicando..." : "Publicar en la red"}
        </button>
      </form>
    </div>
  );
}

function RejectionModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="opentube-rejection-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative max-w-sm w-full rounded-2xl p-6 text-center"
        style={{ background: "#151515", border: "1px solid #272727" }}
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full hover:bg-[#1f1f1f] text-muted-foreground"
        >
          ✕
        </button>
        <p id="opentube-rejection-title" className="text-sm text-white pt-4">
          Lo sentimos, tu solicitud ha sido rechazada
        </p>
      </div>
    </div>
  );
}
