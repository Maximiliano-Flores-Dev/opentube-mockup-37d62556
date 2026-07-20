import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ghost, Plus, X, ShieldCheck, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadAccounts,
  removeAccount,
  touchAccount,
  markEntered,
  type SavedAccount,
} from "@/lib/saved-accounts";
import { clearGuestIdentity } from "@/hooks/useGuestIdentity";
import opentubeLogo from "@/assets/opentube-logo.png.asset.json";

export function ProfileGate({ onEntered }: { onEntered: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setAccounts(loadAccounts());
  }, []);

  async function pick(a: SavedAccount) {
    setBusy(a.userId);
    setError(null);
    try {
      // Hot-swap session using the stored refresh token. setSession refreshes
      // if the access token is expired — the refresh token is the source of truth.
      await qc.cancelQueries();
      qc.clear();
      const { error } = await supabase.auth.setSession({
        access_token: a.accessToken,
        refresh_token: a.refreshToken,
      });
      if (error) throw error;
      touchAccount(a.userId);
      markEntered();
      onEntered();
    } catch (err) {
      // Refresh token expired or revoked — nudge to /auth with email prefilled.
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No pudimos reanudar esta sesión: ${msg}. Vuelve a iniciar sesión.`);
      removeAccount(a.userId);
      setAccounts(loadAccounts());
    } finally {
      setBusy(null);
    }
  }

  async function enterAsGuest() {
    setBusy("guest");
    try {
      // Ensure no lingering signed-in session leaks into guest mode.
      await qc.cancelQueries();
      qc.clear();
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.auth.signOut();
      clearGuestIdentity(); // generate a fresh alias for this one-time profile
      markEntered();
      onEntered();
    } finally {
      setBusy(null);
    }
  }

  function removeOne(userId: string) {
    removeAccount(userId);
    setAccounts(loadAccounts());
  }

  const hasAny = accounts.length > 0;

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-10 sm:py-16"
      style={{ background: "#0f0f0f" }}
    >
      <img
        src={opentubeLogo.url}
        alt="OpenTube"
        className="h-9 sm:h-11 w-auto mb-8 sm:mb-12 opacity-95"
      />

      <h1 className="text-2xl sm:text-4xl font-semibold text-white text-center">
        {hasAny ? "¿Quién está viendo?" : "Elige cómo entrar"}
      </h1>
      <p className="mt-2 text-xs sm:text-sm text-muted-foreground text-center max-w-md">
        Cada nodo tiene su propio historial, likes y suscripciones. Los perfiles se
        guardan solo en este dispositivo.
      </p>

      {error && (
        <div className="mt-4 max-w-md text-xs text-red-400 text-center">{error}</div>
      )}

      {hasAny && (
        <div className="mt-8 sm:mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 w-full max-w-3xl">
          {accounts.map((a) => (
            <ProfileTile
              key={a.userId}
              account={a}
              editing={editing}
              busy={busy === a.userId}
              disabled={busy !== null}
              onPick={() => pick(a)}
              onRemove={() => removeOne(a.userId)}
            />
          ))}
          <AddTile
            disabled={busy !== null}
            onClick={() => navigate({ to: "/auth" })}
          />
        </div>
      )}

      <div className="mt-8 sm:mt-10 w-full max-w-md space-y-3">
        {hasAny && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="w-full text-xs text-muted-foreground hover:text-white"
          >
            {editing ? "Listo" : "Administrar perfiles"}
          </button>
        )}

        <div className="pt-4 border-t space-y-3" style={{ borderColor: "#272727" }}>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground text-center">
            Entrar como
          </div>

          {!hasAny && (
            <Link
              to="/auth"
              className="w-full h-12 rounded-xl font-semibold text-black flex items-center justify-center gap-2"
              style={{ background: "#facc15" }}
            >
              <LogIn className="h-4 w-4" />
              Iniciar sesión / Crear cuenta
            </Link>
          )}

          <button
            type="button"
            onClick={enterAsGuest}
            disabled={busy !== null}
            className="w-full h-12 rounded-xl border text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-[#1a1a1a] transition-colors disabled:opacity-60"
            style={{ borderColor: "#272727", background: "#151515" }}
          >
            <Ghost className="h-4 w-4 text-yellow-400" />
            {busy === "guest" ? "Preparando…" : "One-time profile"}
          </button>
          <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            El modo incógnito se borra al cerrar esta pestaña.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileTile({
  account,
  editing,
  busy,
  disabled,
  onPick,
  onRemove,
}: {
  account: SavedAccount;
  editing: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  const initials = account.channelInitials || "??";
  const color = account.channelColor || "linear-gradient(135deg,#ef4444,#f59e0b)";
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="relative h-20 w-20 sm:h-28 sm:w-28 rounded-2xl overflow-hidden transition-transform hover:scale-105 disabled:opacity-60 disabled:hover:scale-100 group"
        style={{ border: "2px solid transparent" }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#facc15")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
      >
        {account.avatarUrl ? (
          <img
            src={account.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="h-full w-full grid place-items-center text-2xl sm:text-3xl font-bold text-black"
            style={{ background: color }}
          >
            {initials}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/60 text-xs text-white">
            Entrando…
          </span>
        )}
        {editing && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-1 right-1 h-6 w-6 rounded-full grid place-items-center bg-black/80 border border-white/20 text-white hover:bg-red-500"
            aria-label="Quitar perfil"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      <div className="text-center min-w-0 w-full">
        <div className="text-xs sm:text-sm font-medium text-white truncate">
          {account.displayName || account.channelName}
        </div>
        {account.email && (
          <div className="text-[10px] text-muted-foreground truncate">
            {account.email}
          </div>
        )}
      </div>
    </div>
  );
}

function AddTile({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="h-20 w-20 sm:h-28 sm:w-28 rounded-2xl grid place-items-center transition-colors hover:bg-[#1e1e1e] disabled:opacity-50"
        style={{ background: "#151515", border: "2px dashed #333" }}
        aria-label="Añadir cuenta"
      >
        <Plus className="h-8 w-8 text-muted-foreground" />
      </button>
      <div className="text-xs sm:text-sm text-muted-foreground">Añadir cuenta</div>
    </div>
  );
}
