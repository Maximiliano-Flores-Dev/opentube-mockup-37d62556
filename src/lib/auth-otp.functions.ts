import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomInt } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30_000;

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/\s|-|\(|\)/g, "");
  if (!/^\+[1-9]\d{6,15}$/.test(trimmed)) {
    throw new Error("Número inválido. Usa formato internacional E.164 (ej: +34600123456).");
  }
  return trimmed;
}

async function sendViaTwilio(
  channel: "sms" | "whatsapp",
  to: string,
  body: string,
): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  if (!lovableKey || !twilioKey) {
    throw new Error("El proveedor SMS/WhatsApp no está configurado en el servidor.");
  }

  const fromSms = process.env.TWILIO_SMS_FROM;
  const fromWa = process.env.TWILIO_WHATSAPP_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  const params = new URLSearchParams();
  params.set("Body", body);

  if (channel === "whatsapp") {
    if (!fromWa) {
      throw new Error(
        "Falta TWILIO_WHATSAPP_FROM. Configura el número de WhatsApp Business del que se enviarán los códigos.",
      );
    }
    params.set("From", fromWa.startsWith("whatsapp:") ? fromWa : `whatsapp:${fromWa}`);
    params.set("To", `whatsapp:${to}`);
  } else {
    if (messagingServiceSid) {
      params.set("MessagingServiceSid", messagingServiceSid);
    } else if (fromSms) {
      params.set("From", fromSms);
    } else {
      throw new Error(
        "Falta TWILIO_SMS_FROM o TWILIO_MESSAGING_SERVICE_SID en el servidor.",
      );
    }
    params.set("To", to);
  }

  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Twilio ${channel}] ${res.status}: ${text}`);
    throw new Error(`No se pudo enviar el código (${res.status}). Revisa el número o el proveedor.`);
  }
}

function pseudoEmail(phone: string): string {
  // Deterministic, per-phone, non-routable pseudo-email used only to bind a
  // Supabase Auth user to a verified phone number. Not user-visible.
  const digits = phone.replace(/[^0-9]/g, "");
  return `phone_${digits}@opentube.phone.local`;
}

/* ----------------------------- requestOtp ----------------------------- */

const RequestInput = z.object({
  phone: z.string().min(4).max(20),
  channel: z.enum(["sms", "whatsapp"]),
});

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RequestInput.parse(d))
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Rate-limit: no more than one OTP every 30s per identifier+channel
    const { data: recent } = await supabaseAdmin
      .from("otp_codes")
      .select("created_at")
      .eq("identifier", phone)
      .eq("channel", data.channel)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recent && recent[0]) {
      const last = new Date(recent[0].created_at).getTime();
      if (Date.now() - last < OTP_RESEND_COOLDOWN_MS) {
        throw new Error("Espera unos segundos antes de solicitar otro código.");
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "opentube-otp";

    const { error: insErr } = await supabaseAdmin.from("otp_codes").insert({
      identifier: phone,
      channel: data.channel,
      code_hash: hashCode(code, salt),
      expires_at: expiresAt,
    });
    if (insErr) throw new Error(insErr.message);

    const label = data.channel === "whatsapp" ? "WhatsApp" : "SMS";
    await sendViaTwilio(
      data.channel,
      phone,
      `Tu código OpenTube (${label}): ${code}\nVálido ${OTP_TTL_SECONDS / 60} minutos. Nunca lo compartas.`,
    );

    return { ok: true, expiresAt };
  });

/* ------------------------------ verifyOtp ------------------------------ */

const VerifyInput = z.object({
  phone: z.string().min(4).max(20),
  channel: z.enum(["sms", "whatsapp"]),
  code: z.string().regex(/^\d{6}$/, "El código son 6 dígitos"),
});

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data }) => {
    const phone = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "opentube-otp";

    const { data: rows, error } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("identifier", phone)
      .eq("channel", data.channel)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) throw new Error("No hay ningún código activo para este número.");

    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("El código ha expirado. Solicita uno nuevo.");
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new Error("Demasiados intentos. Solicita un nuevo código.");
    }

    const expected = hashCode(data.code, salt);
    if (expected !== row.code_hash) {
      await supabaseAdmin
        .from("otp_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("Código incorrecto.");
    }

    await supabaseAdmin.from("otp_codes").update({ consumed: true }).eq("id", row.id);

    // Bind (or create) a Supabase Auth user for this phone number and mint a
    // one-time magic-link token the client uses to establish a real session.
    const email = pseudoEmail(phone);

    // Try to find existing user
    let userId: string | null = null;
    {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const existing = list?.users?.find(
        (u) => u.email === email || u.phone === phone.replace(/^\+/, ""),
      );
      if (existing) userId = existing.id;
    }
    if (!userId) {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        phone: phone.replace(/^\+/, ""),
        user_metadata: {
          auth_channel: data.channel,
          phone_e164: phone,
        },
      });
      if (cErr || !created?.user) {
        throw new Error(cErr?.message ?? "No se pudo crear el usuario.");
      }
      userId = created.user.id;
    }

    const { data: linkData, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(linkErr?.message ?? "No se pudo generar la sesión.");
    }

    return {
      email,
      tokenHash: linkData.properties.hashed_token,
    };
  });
