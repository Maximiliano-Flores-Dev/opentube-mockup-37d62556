import {
  Check,
  Clock,
  ShieldCheck,
  Lock,
  Network,
  Radio,
  Users,
  Wifi,
  Eye,
  Info,
} from "lucide-react";

type Status = "active" | "roadmap" | "external";

type Row = {
  icon: typeof ShieldCheck;
  label: string;
  status: Status;
  detail: string;
};

const ROWS: Row[] = [
  {
    icon: Lock,
    label: "Cifrado en tránsito (TLS 1.3)",
    status: "active",
    detail: "Toda tu comunicación con OpenTube viaja cifrada extremo-a-servidor con TLS 1.3.",
  },
  {
    icon: ShieldCheck,
    label: "Contraseñas hasheadas (bcrypt)",
    status: "active",
    detail: "Las contraseñas se almacenan con bcrypt salteado. Nadie — ni el operador del nodo — puede leerlas.",
  },
  {
    icon: Check,
    label: "Protección contra contraseñas filtradas (HIBP)",
    status: "active",
    detail: "Al registrarte, comprobamos tu contraseña contra Have I Been Pwned sin enviarla completa.",
  },
  {
    icon: Users,
    label: "Aislamiento por usuario (RLS)",
    status: "active",
    detail: "Row-Level Security en la base de datos. Nadie puede leer tus filas privadas ni aunque llame directo a la API.",
  },
  {
    icon: Eye,
    label: "Cero telemetría corporativa",
    status: "active",
    detail: "No hay Google Analytics, Meta Pixel, Hotjar ni SDKs de rastreo. Solo métricas propias mínimas.",
  },
  {
    icon: Lock,
    label: "Cifrado extremo-a-extremo entre usuarios",
    status: "roadmap",
    detail:
      "Hoy cada sesión genera claves locales, pero un navegador no puede garantizar E2E sin un cliente nativo verificable. Está en el roadmap como extensión/app nativa.",
  },
  {
    icon: Network,
    label: "Red Tor / dominio .onion",
    status: "external",
    detail:
      "Un servicio .onion nativo requiere infraestructura del operador. Mientras tanto, esta app funciona perfectamente si la abres en Tor Browser.",
  },
  {
    icon: Radio,
    label: "WebRTC P2P (data channel)",
    status: "roadmap",
    detail:
      "La señalización híbrida y el canal de datos P2P están en desarrollo. El streaming directo de vídeo vía WebRTC aún no está implementado.",
  },
  {
    icon: Wifi,
    label: "VPN integrada",
    status: "external",
    detail:
      "Una VPN en el navegador es una promesa hueca (el propio navegador vería tu IP real). Usa un cliente nativo dedicado: Mullvad, ProtonVPN o IVPN.",
  },
];

const STATUS_META: Record<
  Status,
  { label: string; color: string; bg: string; icon: typeof Check }
> = {
  active: {
    label: "Activo",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    icon: Check,
  },
  roadmap: {
    label: "Roadmap",
    color: "#9ca3af",
    bg: "rgba(156, 163, 175, 0.12)",
    icon: Clock,
  },
  external: {
    label: "Requiere cliente externo",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    icon: Info,
  },
};

export function PrivacyPanel() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4" style={{ background: "#151515", border: "1px solid #272727" }}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold">Privacidad y red</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Somos radicalmente honestos: solo marcamos como <b className="text-white">Activo</b> lo
          que realmente está protegiendo tu sesión ahora mismo. Todo lo demás
          explica qué falta o qué alternativa real puedes usar.
        </p>
      </div>
      <div
        className="rounded-xl divide-y overflow-hidden"
        style={{ background: "#151515", border: "1px solid #272727", borderColor: "#272727" }}
      >
        {ROWS.map((r) => {
          const meta = STATUS_META[r.status];
          const Icon = r.icon;
          const StatusIcon = meta.icon;
          return (
            <div key={r.label} className="p-4 flex gap-3" style={{ borderColor: "#272727" }}>
              <span
                className="h-9 w-9 rounded-lg grid place-items-center shrink-0"
                style={{ background: meta.bg, color: meta.color }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium">{r.label}</div>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {r.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
