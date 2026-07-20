import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LogOut,
  User as UserIcon,
  Upload as UploadIcon,
  ShieldCheck,
  Ghost,
  LogIn,
  Settings,
  Code,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Check,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clearGuestIdentity } from "@/hooks/useGuestIdentity";
import { clearEntered, loadAccounts, removeAccount, touchAccount } from "@/lib/saved-accounts";
import type { SessionState } from "@/hooks/useSession";

export function UserMenu({ session }: { session: SessionState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function handleSignOut() {
    try {
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      clearGuestIdentity();
      clearEntered();
    } finally {
      setOpen(false);
      navigate({ to: "/", replace: true });
    }
  }

  if (session.mode === "guest" || session.mode === "loading") {
    const g = session.guest;
    return (
      <div ref={ref} className="relative flex items-center gap-2">
        <div
          className="hidden sm:flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-full"
          style={{ background: "#1a1a1a", border: "1px solid #272727" }}
          title="Sesión desechable · sin cuenta"
        >
          <span
            className="h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold text-black"
            style={{ background: g.color }}
          >
            <Ghost className="h-3 w-3" />
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {g.alias}
          </span>
        </div>
        <Link
          to="/auth"
          className="flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold text-black"
          style={{ background: "#facc15" }}
        >
          <LogIn className="h-3.5 w-3.5" />
          Iniciar sesión
        </Link>
      </div>
    );
  }

  const p = session.profile;
  const initials = p?.channelInitials ?? "??";
  const color = p?.channelColor ?? "linear-gradient(135deg,#ef4444,#f59e0b)";
  const displayName = p?.displayName ?? "Mi nodo";
  const channelName = p?.channelName ?? displayName;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-11 w-11 grid place-items-center rounded-full"
        aria-label="Menú de usuario"
      >
        {p?.avatarUrl ? (
          <img
            src={p.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span
            className="h-8 w-8 rounded-full grid place-items-center text-xs font-semibold text-black"
            style={{ background: color }}
          >
            {initials}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-12 w-72 rounded-xl overflow-hidden z-50 shadow-2xl"
          style={{ background: "#151515", border: "1px solid #272727" }}
        >
          <div className="p-4 border-b" style={{ borderColor: "#272727" }}>
            <div className="flex items-center gap-3">
              {p?.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span
                  className="h-10 w-10 rounded-full grid place-items-center text-sm font-bold text-black"
                  style={{ background: color }}
                >
                  {initials}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{displayName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  @{channelName}
                </div>
              </div>
            </div>
          </div>
          <MenuItem
            icon={UserIcon}
            label="Editar perfil"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/profile" });
            }}
          />
          <MenuItem
            icon={UploadIcon}
            label="Subir video"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/upload" });
            }}
          />
          <MenuItem
            icon={ShieldCheck}
            label="Privacidad y red"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/profile", hash: "privacidad" });
            }}
          />
          <MenuItem
            icon={Code}
            label="Auditar código fuente"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/audit" });
            }}
          />
          <AccountSwitcher
            currentUserId={session.userId}
            onClose={() => setOpen(false)}
          />
          <div className="border-t" style={{ borderColor: "#272727" }} />
          <MenuItem
            icon={LogOut}
            label="Cerrar sesión"
            onClick={handleSignOut}
            danger
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof UserIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[#1e1e1e] transition-colors ${
        danger ? "text-red-400" : "text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function AccountSwitcher({
  currentUserId,
  onClose,
}: {
  currentUserId: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [accounts, setAccounts] = useState(loadAccounts);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function switchTo(account: (typeof accounts)[number]) {
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      });
      if (error || !data.session) {
        removeAccount(account.userId);
        setAccounts(loadAccounts());
        return;
      }
      touchAccount(account.userId);
      await qc.cancelQueries();
      qc.clear();
      onClose();
      navigate({ to: "/", replace: true });
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-[#1e1e1e] transition-colors"
      >
        <span className="flex items-center gap-3">
          <Users className="h-4 w-4" />
          Cambiar de perfil
        </span>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          <div className="rounded-lg overflow-hidden" style={{ background: "#0f0f0f", border: "1px solid #272727" }}>
            {accounts.map((a) => (
              <button
                key={a.userId}
                onClick={() => switchTo(a)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1a1a] transition-colors"
              >
                <span
                  className="h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold text-black"
                  style={{ background: a.channelColor }}
                >
                  {a.channelInitials}
                </span>
                <span className="flex-1 text-xs truncate">{a.displayName}</span>
                {a.userId === currentUserId && (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                )}
              </button>
            ))}
            <Link
              to="/auth"
              onClick={() => {
                onClose();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1a1a] transition-colors text-xs text-muted-foreground"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Añadir otra cuenta
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
