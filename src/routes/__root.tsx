import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "OpenTube — Video soberano y privado" },
      { name: "description", content: "OpenTube es una plataforma de video descentralizada, sin telemetría corporativa y con control real de tu identidad y privacidad." },
      { name: "author", content: "OpenTube" },
      { property: "og:title", content: "OpenTube — Video soberano y privado" },
      { property: "og:description", content: "OpenTube es una plataforma de video descentralizada, sin telemetría corporativa y con control real de tu identidad y privacidad." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "OpenTube — Video soberano y privado" },
      { name: "twitter:description", content: "OpenTube es una plataforma de video descentralizada, sin telemetría corporativa y con control real de tu identidad y privacidad." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/qeJCYpPI11QGb54fSWf2Eznh6wk1/social-images/social-1784581015719-1000014187.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/qeJCYpPI11QGb54fSWf2Eznh6wk1/social-images/social-1784581015719-1000014187.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Dynamic import so this only runs in the browser; supabase client touches localStorage.
    let unsub: (() => void) | undefined;
    Promise.all([
      import("@/integrations/supabase/client"),
      import("@/lib/saved-accounts"),
      import("@/lib/profile.functions"),
    ]).then(([{ supabase }, savedAccounts, profileFns]) => {
      const persistFromSession = async (session: {
        access_token: string;
        refresh_token: string;
        user: { id: string; email: string | null };
      } | null) => {
        if (!session) return;
        try {
          // Enrich with profile info; falls back to sane defaults if it fails.
          const profile = await profileFns.getMyProfile().catch(() => null);
          savedAccounts.upsertAccount({
            userId: session.user.id,
            email: session.user.email ?? null,
            displayName: profile?.displayName ?? session.user.email ?? "Nodo",
            channelName: profile?.channelName ?? session.user.email ?? "Nodo",
            channelInitials: profile?.channelInitials ?? "??",
            channelColor:
              profile?.channelColor ?? "linear-gradient(135deg,#ef4444,#f59e0b)",
            avatarUrl: profile?.avatarUrl ?? null,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            lastUsed: Date.now(),
          });
        } catch {}
      };

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          persistFromSession(session as never);
        }
        if (event === "SIGNED_OUT") {
          savedAccounts.clearEntered();
        }
        if (
          event !== "SIGNED_IN" &&
          event !== "SIGNED_OUT" &&
          event !== "USER_UPDATED"
        ) {
          return;
        }
        router.invalidate();
        if (event !== "SIGNED_OUT") {
          queryClient.invalidateQueries();
        }
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => {
      if (unsub) unsub();
    };
  }, [router, queryClient]);


  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
