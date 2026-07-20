import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Restablecer contraseña — OpenTube" },
      { name: "description", content: "Elige una nueva contraseña para tu cuenta OpenTube." },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Supabase drops the recovery token in the URL hash and auto-establishes
    // a temporary session via detectSessionInUrl. Confirm we have one.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setError(
          "El enlace de restablecimiento ha expirado o no es válido. Solicita uno nuevo desde la pantalla de acceso.",
        );
      }
    };
    check();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setNotice("Contraseña actualizada. Redirigiendo…");
      setTimeout(() => navigate({ to: "/" }), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0f0f0f" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#151515", border: "1px solid #272727" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span
            className="h-8 w-8 grid place-items-center rounded-full"
            style={{ background: "#facc15" }}
          >
            <ShieldCheck className="h-4 w-4 text-black" />
          </span>
          <span className="font-bold tracking-wider">OPENTUBE</span>
        </div>
        <h1 className="text-xl font-semibold">Restablecer contraseña</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige una nueva contraseña para tu cuenta.
        </p>

        {ready ? (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              className="w-full h-11 rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 text-sm outline-none focus:border-[#facc15]"
            />
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirma la contraseña"
              className="w-full h-11 rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 text-sm outline-none focus:border-[#facc15]"
            />
            {error && <div className="text-xs text-red-400">{error}</div>}
            {notice && <div className="text-xs text-emerald-400">{notice}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg font-semibold text-black disabled:opacity-60"
              style={{ background: "#facc15" }}
            >
              {loading ? "Guardando…" : "Guardar nueva contraseña"}
            </button>
          </form>
        ) : (
          <div className="mt-5 space-y-3">
            {error && <div className="text-xs text-red-400">{error}</div>}
            <Link
              to="/auth"
              className="block w-full h-11 rounded-lg font-semibold text-black grid place-items-center"
              style={{ background: "#facc15" }}
            >
              Volver al acceso
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
