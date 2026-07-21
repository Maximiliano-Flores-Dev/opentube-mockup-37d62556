import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Save, Upload } from "lucide-react";
import {
  getMyProfile,
  updateMyProfile,
  getAvatarUploadUrl,
  setAvatarPath,
} from "@/lib/profile.functions";
import { PrivacyPanel } from "@/components/PrivacyPanel";
import { supabase } from "@/integrations/supabase/client";
import { clearEntered, loadAccounts, upsertAccount } from "@/lib/saved-accounts";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Mi perfil — OpenTube" },
      { name: "description", content: "Edita tu perfil, tu canal y tus preferencias de privacidad." },
    ],
  }),
});

const CHANNEL_COLORS = [
  "oklch(0.62 0.22 25)",
  "oklch(0.65 0.2 145)",
  "oklch(0.6 0.2 260)",
  "oklch(0.68 0.18 200)",
  "oklch(0.7 0.2 60)",
  "oklch(0.6 0.22 320)",
];

function ProfilePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getProfileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const uploadUrlFn = useServerFn(getAvatarUploadUrl);
  const setPathFn = useServerFn(setAvatarPath);

  const profileQ = useQuery({
    queryKey: ["my-profile-editor"],
    queryFn: () => getProfileFn(),
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelColor, setChannelColor] = useState(CHANNEL_COLORS[2]);
  const [hideProgress, setHideProgress] = useState(false);
  const [dontCountViews, setDontCountViews] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setDisplayName(p.displayName);
    setBio(p.bio);
    setChannelName(p.channelName);
    setChannelColor(p.channelColor);
    setHideProgress(p.privacyHideProgress);
    setDontCountViews(p.privacyDontCountViews);
  }, [profileQ.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateFn({
        data: {
          displayName,
          bio,
          channelName,
          channelColor,
          privacyHideProgress: hideProgress,
          privacyDontCountViews: dontCountViews,
        },
      });
      setMessage("Perfil actualizado.");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["my-profile-editor"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { path, signedUrl } = await uploadUrlFn({
        data: { filename: file.name, contentType: file.type || "image/jpeg" },
      });
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!put.ok) throw new Error("No se pudo subir el avatar.");
      await setPathFn({ data: { path } });
      setMessage("Avatar actualizado.");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["my-profile-editor"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    clearEntered();
    navigate({ to: "/", replace: true });
  }

  const p = profileQ.data;

  return (
    <div className="min-h-screen" style={{ background: "#0f0f0f" }}>
      <header
        className="h-14 flex items-center gap-3 px-4 border-b"
        style={{ borderColor: "#272727" }}
      >
        <Link
          to="/"
          className="h-10 w-10 grid place-items-center rounded-full hover:bg-[#1a1a1a]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-semibold">Mi perfil</h1>
        <button
          onClick={signOut}
          className="ml-auto text-xs h-9 px-3 rounded-lg border border-[#272727] hover:bg-[#1a1a1a]"
        >
          Cerrar sesión
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Identity */}
        <section
          className="rounded-xl p-4"
          style={{ background: "#151515", border: "1px solid #272727" }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              {p?.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <span
                  className="h-16 w-16 rounded-full grid place-items-center text-lg font-bold text-black"
                  style={{ background: channelColor }}
                >
                  {channelName
                    .split(/\s+/)
                    .map((w) => w[0])
                    .filter(Boolean)
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "??"}
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full grid place-items-center text-black disabled:opacity-50"
                style={{ background: "#facc15" }}
                aria-label="Subir avatar"
                title="Subir nueva imagen"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{displayName || "Sin nombre"}</div>
              <div className="text-xs text-muted-foreground truncate">@{channelName}</div>
            </div>
          </div>
        </section>

        <form onSubmit={save} className="space-y-4">
          <section
            className="rounded-xl p-4 space-y-3"
            style={{ background: "#151515", border: "1px solid #272727" }}
          >
            <h2 className="text-sm font-semibold">Identidad pública</h2>
            <Field label="Nombre visible">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                required
                className="w-full h-10 rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 text-sm outline-none focus:border-[#facc15]"
              />
            </Field>
            <Field label="Nombre de canal">
              <input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                maxLength={80}
                required
                className="w-full h-10 rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 text-sm outline-none focus:border-[#facc15]"
              />
            </Field>
            <Field label={`Biografía (${bio.length}/200)`}>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                rows={3}
                placeholder="Descríbete en un par de líneas…"
                className="w-full rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 py-2 text-sm outline-none focus:border-[#facc15]"
              />
            </Field>
            <Field label="Color del canal">
              <div className="flex gap-2 flex-wrap">
                {CHANNEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannelColor(c)}
                    className={`h-8 w-8 rounded-full transition-transform ${
                      channelColor === c ? "ring-2 ring-white scale-110" : ""
                    }`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </Field>
          </section>

          <section
            id="preferencias"
            className="rounded-xl p-4 space-y-2"
            style={{ background: "#151515", border: "1px solid #272727" }}
          >
            <h2 className="text-sm font-semibold">Preferencias de privacidad</h2>
            <Toggle
              checked={hideProgress}
              onChange={setHideProgress}
              label="Ocultar mi progreso de reproducción"
              detail="Tu barra roja de 'visto' no se comparte con nadie. Ya se guarda solo en tu dispositivo."
            />
            <Toggle
              checked={dontCountViews}
              onChange={setDontCountViews}
              label="No contar mis vistas"
              detail="Los vídeos que ves no incrementan el contador público de reproducciones."
            />
          </section>

          {error && <div className="text-xs text-red-400">{error}</div>}
          {message && <div className="text-xs text-emerald-400">{message}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-lg font-semibold text-black flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "#facc15" }}
          >
            <Save className="h-4 w-4" />
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>

        <section id="privacidad">
          <PrivacyPanel />
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 p-3 rounded-lg text-left hover:bg-[#1a1a1a] transition-colors"
    >
      <span
        className={`mt-0.5 h-5 w-9 rounded-full relative transition-colors ${
          checked ? "bg-yellow-400" : "bg-[#272727]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {detail}
        </span>
      </span>
    </button>
  );
}
