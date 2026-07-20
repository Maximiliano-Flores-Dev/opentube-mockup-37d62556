# Plan: completar el roadmap de OpenTube

Este plan cierra los puntos pendientes del roadmap existente (perfiles, modo invitado, capa de privacidad honesta y mejoras de auth).

## 1. Base de datos y backend

- Crear el trigger `on_auth_user_created` en `auth.users` que invoque `public.handle_new_user()` y auto-genere el perfil al registrarse.
- Hacer público el bucket `avatars` para que los avatares sean visibles sin URL firmada (o mantener URLs firmadas si se prefiere privado, pero ajustar la UI para que no expiren).
- Activar HIBP vía `configure_auth` con `password_hibp_enabled: true`.
- Añadir server fn `getProfileByChannel` en `src/lib/profile.functions.ts` para mostrar canal en vídeos/publicaciones futuras.

## 2. Subida de vídeos desde el perfil

- En `src/routes/_authenticated/upload.tsx`, eliminar los campos manuales de canal/iniciales/color.
- Leer el perfil del uploader con `getMyProfile` y pasar `channelName`, `channelColor` e `initials` al crear el vídeo.
- En `src/lib/videos.functions.ts`, modificar `createVideo` para que tome los datos de canal del perfil del usuario autenticado en lugar de aceptarlos como input.

## 3. Privacidad real en reproducciones

- En `src/lib/videos.functions.ts`, cambiar `incrementView` a función autenticada (`requireSupabaseAuth`).
- Antes de incrementar, consultar el perfil del espectador y respetar `privacy_dont_count_views`.
- En `src/routes/index.tsx`, ajustar `openVideo` para que los invitados sigan pudiendo reproducir, pero las vistas solo se cuenten cuando el usuario está autenticado y no ha activado "No contar mis vistas".

## 4. Panel de privacidad honesto

- Actualizar `src/components/PrivacyPanel.tsx` para que refleje el estado real:
  - E2E entre usuarios → "Próximamente · requiere cliente nativo" (gris).
  - Red Tor / .onion → "No disponible · funciona en Tor Browser" (gris + link a docs).
  - WebRTC P2P de vídeo → "Roadmap" (gris).
  - VPN integrada → "Requiere app nativa/extensión" (gris + guía).
- Mantener como "Activo" solo TLS, bcrypt, HIBP, RLS y cero telemetría.
- Añadir tooltips explicando por qué las funciones no disponibles no pueden existir en un navegador puro.

## 5. Metadatos y pulido de auth

- En `src/routes/__root.tsx`, reemplazar el título y descripción por defecto "Lovable App" por metadatos reales de OpenTube.
- Asegurar que `og:title`, `og:description`, `og:type` y `twitter:card` coincidan.
- Verificar que el listener `onAuthStateChange` invalida el router y limpia la caché correctamente en sign-out.

## 6. Verificación end-to-end

- Construir el proyecto y revisar que no haya errores de tipo ni de importación.
- Probar flujo: invitado → reproducir vídeo → intentar like (redirige a /auth) → crear cuenta → perfil auto-creado → subir vídeo con canal del perfil.
- Revisar en preview que el banner de invitado, el menú de usuario y el panel de privacidad se rendericen correctamente.

## Fuera de alcance

- Tor nativo, VPN funcional, P2P real de streaming ni E2E real entre usuarios: siguen siendo "Próximamente" con explicación honesta.
- Microsoft OAuth: no soportado por Lovable Cloud; se mantiene la opción de email/magic link/SMS/WhatsApp/Google/Apple.

¿Procedo con este alcance?