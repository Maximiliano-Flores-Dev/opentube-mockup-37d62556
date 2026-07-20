import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Mail, MessageCircle, Phone, Sparkles } from "lucide-react";
import { requestOtp, verifyOtp } from "@/lib/auth-otp.functions";
import { markEntered } from "@/lib/saved-accounts";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Acceder — OpenTube" },
      { name: "description", content: "Inicia sesión en OpenTube por email, magic link, SMS o WhatsApp." },
    ],
  }),
});

type Tab = "email" | "magic" | "sms" | "whatsapp";

function AuthPage() {
  const [tab, setTab] = useState<Tab>("email");

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "#0f0f0f" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#151515", border: "1px solid #272727" }}
      >
        <Link to="/" className="flex items-center gap-2 mb-6">
          <span
            className="h-8 w-8 grid place-items-center rounded-full"
            style={{ background: "#facc15" }}
          >
            <ShieldCheck className="h-4 w-4 text-black" />
          </span>
          <span className="font-bold tracking-wider">OPENTUBE</span>
        </Link>
        <h1 className="text-xl font-semibold text-white">Acceder a tu nodo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige un canal soberano para autenticarte.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Compatible con Gmail, Proton Mail, Tutanota, Outlook, iCloud y cualquier proveedor de email.
        </p>

        <div className="mt-5 grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#0f0f0f] border border-[#272727]">
          <TabBtn on={tab === "email"} onClick={() => setTab("email")} icon={Mail} label="Email" />
          <TabBtn on={tab === "magic"} onClick={() => setTab("magic")} icon={Sparkles} label="Magic" />
          <TabBtn on={tab === "sms"} onClick={() => setTab("sms")} icon={Phone} label="SMS" />
          <TabBtn on={tab === "whatsapp"} onClick={() => setTab("whatsapp")} icon={MessageCircle} label="WA" />
        </div>

        <div className="mt-5">
          {tab === "email" ? (
            <EmailForm />
          ) : tab === "magic" ? (
            <MagicLinkForm />
          ) : (
            <OtpForm channel={tab} />
          )}
        </div>

        <div className="mt-6 pt-4 border-t text-center" style={{ borderColor: "#272727" }}>
          <Link to="/" className="text-[11px] text-muted-foreground hover:text-white">
            ← Seguir como invitado (modo incógnito)
          </Link>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  on,
  onClick,
  icon: Icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof Mail;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
        on ? "bg-[#facc15] text-black" : "text-muted-foreground hover:text-white"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/* ------------------------------- Email ------------------------------- */

function EmailForm() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice("Cuenta creada. Revisa tu email si se requiere confirmación, o inicia sesión.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        markEntered();
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.dev"
        className="w-full h-11 rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 text-sm outline-none focus:border-[#facc15]"
      />
      <input
        type="password"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña (mín. 6 caracteres)"
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
        {loading ? "..." : mode === "signin" ? "Entrar" : "Registrarme"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="w-full text-xs text-muted-foreground hover:text-white"
      >
        {mode === "signin" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>
      {mode === "signin" && <ForgotPasswordLink email={email} />}
    </form>
  );
}

function ForgotPasswordLink({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function trigger() {
    if (!email) {
      setMsg("Escribe tu email arriba primero.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMsg("Enviado. Revisa tu bandeja de entrada.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={trigger}
        disabled={busy}
        className="text-[11px] text-muted-foreground hover:text-white underline disabled:opacity-60"
      >
        ¿Olvidaste tu contraseña?
      </button>
      {msg && <div className="mt-1 text-[11px] text-emerald-400">{msg}</div>}
    </div>
  );
}

/* ------------------------------ Magic Link ------------------------------ */

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setNotice(
        "Te enviamos un enlace mágico. Ábrelo desde el mismo navegador para entrar sin contraseña.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.dev"
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
        {loading ? "..." : "Enviarme enlace mágico"}
      </button>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Sin contraseña. Recibes un enlace único de un solo uso; al abrirlo,
        tu sesión queda iniciada en este navegador.
      </p>
    </form>
  );
}

/* --------------------------- SMS / WhatsApp OTP --------------------------- */

function OtpForm({ channel }: { channel: "sms" | "whatsapp" }) {
  const navigate = useNavigate();
  const reqOtp = useServerFn(requestOtp);
  const doVerify = useServerFn(verifyOtp);
  const [phone, setPhone] = useState("+");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await reqOtp({ data: { phone, channel } });
      setStage("verify");
      setNotice(
        channel === "whatsapp"
          ? "Enviamos un código por WhatsApp. Revisa tus mensajes."
          : "Enviamos un SMS con tu código.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const { email, tokenHash } = await doVerify({
        data: { phone, channel, code },
      });
      // Mint a real Supabase session using the admin-generated magiclink token.
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        email,
        token_hash: tokenHash,
      });
      if (error) throw error;
      markEntered();
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+34600123456"
        disabled={stage === "verify"}
        className="w-full h-11 rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 text-sm outline-none focus:border-[#facc15] disabled:opacity-60"
      />
      {stage === "verify" && (
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="Código de 6 dígitos"
          className="w-full h-11 rounded-lg bg-[#0f0f0f] border border-[#272727] px-3 text-sm tracking-[0.4em] font-mono outline-none focus:border-[#facc15]"
        />
      )}
      {error && <div className="text-xs text-red-400">{error}</div>}
      {notice && <div className="text-xs text-emerald-400">{notice}</div>}
      <button
        type="button"
        onClick={stage === "request" ? send : verify}
        disabled={loading || (stage === "verify" && code.length !== 6)}
        className="w-full h-11 rounded-lg font-semibold text-black disabled:opacity-60"
        style={{ background: "#facc15" }}
      >
        {loading ? "..." : stage === "request" ? "Enviar código" : "Verificar y entrar"}
      </button>
      {stage === "verify" && (
        <button
          type="button"
          onClick={() => {
            setStage("request");
            setCode("");
            setNotice(null);
          }}
          className="w-full text-xs text-muted-foreground hover:text-white"
        >
          Cambiar número
        </button>
      )}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Enviaremos un código de 6 dígitos al número que indiques. Solo lo usamos
        para verificar tu identidad; nunca lo compartimos.
      </p>
    </div>
  );
}
