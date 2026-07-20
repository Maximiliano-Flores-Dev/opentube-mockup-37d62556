import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Code, ExternalLink, Lock, Radio, Server, Eye } from "lucide-react";
import { vaultSummary } from "@/lib/local-db";

export const Route = createFileRoute("/audit")({
  ssr: false,
  component: AuditPage,
  head: () => ({
    meta: [
      { title: "Auditar código fuente — OpenTube" },
      {
        name: "description",
        content: "Transparencia total: inspect code, criptografía local y red de OpenTube.",
      },
    ],
  }),
});

function AuditPage() {
  const [vault, setVault] = useState<Awaited<ReturnType<typeof vaultSummary>> | null>(null);

  useEffect(() => {
    vaultSummary().then(setVault).catch(() => setVault(null));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#0f0f0f" }}>
      <header
        className="h-14 flex items-center gap-3 px-4 border-b sticky top-0 z-10"
        style={{ borderColor: "#272727", background: "#0f0f0f" }}
      >
        <Link
          to="/"
          className="h-10 w-10 grid place-items-center rounded-full hover:bg-[#1a1a1a]"
        >
          <ShieldCheck className="h-5 w-5" />
        </Link>
        <h1 className="font-semibold">Auditar código fuente</h1>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <section
          className="rounded-xl p-5 space-y-3"
          style={{ background: "#151515", border: "1px solid #272727" }}
        >
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-yellow-400" />
            <h2 className="text-base font-semibold">Transparencia de código</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            OpenTube es software libre. Puedes revisar el código fuente, verificar
            que no hay telemetría oculta y auditar la implementación criptográfica
            en tu propio entorno.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/lovable/OpenTube"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-semibold text-black"
              style={{ background: "#facc15" }}
            >
              GitHub <ExternalLink className="h-4 w-4" />
            </a>
            <Link
              to="/"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium border border-[#272727] hover:bg-[#1a1a1a]"
            >
              Volver a la app
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AuditCard
            icon={Lock}
            title="Cifrado local"
            status="Activo"
            detail="IndexedDB cifrada con AES-GCM-256. La clave del dispositivo se almacena separada de los datos."
          />
          <AuditCard
            icon={Radio}
            title="WebRTC P2P"
            status="Activo"
            detail="Señalización híbrida por Supabase; el canal de datos es directo entre navegadores."
          />
          <AuditCard
            icon={Server}
            title="Backend remoto"
            status="Supabase sincronizado"
            detail="Solo almacena claves públicas y señales efímeras. Nunca ve el contenido cifrado."
          />
          <AuditCard
            icon={Eye}
            title="Telemetría"
            status="Cero"
            detail="Sin Google Analytics, Meta Pixel ni rastreadores de terceros en el cliente."
          />
        </div>

        <section
          className="rounded-xl p-5 space-y-3"
          style={{ background: "#151515", border: "1px solid #272727" }}
        >
          <h2 className="text-base font-semibold">Almacenamiento local cifrado</h2>
          {vault ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between border-b border-[#272727] pb-2">
                <span>Claves de datos encriptadas</span>
                <span className="text-white font-medium">{vault.dataKeys.length}</span>
              </div>
              <div className="flex justify-between border-b border-[#272727] pb-2">
                <span>Metadatos sin cifrar</span>
                <span className="text-white font-medium">{vault.metaKeys.length}</span>
              </div>
              <div className="flex justify-between border-b border-[#272727] pb-2">
                <span>Clave de dispositivo (localStorage)</span>
                <span className={vault.deviceKeyPresent.local ? "text-emerald-400" : "text-red-400"}>
                  {vault.deviceKeyPresent.local ? "Presente" : "Ausente"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Clave de dispositivo (sessionStorage)</span>
                <span className={vault.deviceKeyPresent.session ? "text-emerald-400" : "text-red-400"}>
                  {vault.deviceKeyPresent.session ? "Presente" : "Ausente"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudo leer el estado del almacenamiento local.</p>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Nota: los valores aquí son índices cifrados. El contenido real solo se
            descifra en memoria con la clave del dispositivo.
          </p>
        </section>

        <section
          className="rounded-xl p-5 space-y-3"
          style={{ background: "#151515", border: "1px solid #272727" }}
        >
          <h2 className="text-base font-semibold">Bibliotecas criptográficas</h2>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
            <li>Web Crypto API (navegador) para AES-GCM, ECDH, ECDSA y PBKDF2.</li>
            <li>RTCPeerConnection nativo para P2P WebRTC.</li>
            <li>IndexedDB nativo para persistencia local.</li>
            <li>Sin SDKs de terceros con acceso a la red en el flujo criptográfico.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function AuditCard({
  icon: Icon,
  title,
  status,
  detail,
}: {
  icon: typeof Code;
  title: string;
  status: string;
  detail: string;
}) {
  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{ background: "#151515", border: "1px solid #272727" }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="text-xs font-medium text-emerald-400">{status}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
    </div>
  );
}
