import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  client?: { name?: string; client_id?: string; redirect_uris?: string[] } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };

// The supabase.auth.oauth namespace is beta; keep a small typed wrapper.
const oauth = (supabase.auth as unknown as {
  oauth: {
    getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
    approveAuthorization: (id: string) => Promise<OAuthResult>;
    denyAuthorization: (id: string) => Promise<OAuthResult>;
  };
}).oauth;

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "Share your email address",
  profile: "Share your basic profile",
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase session lives in localStorage, absent during SSR.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search["authorization_id"] === "string" ? search["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    const { data: session } = await supabase.auth.getSession();
    return { details: data, account: session.session?.user.email ?? null };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md">
        <h1 className="font-display text-2xl tracking-tight">This authorization request failed</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Start the connection again from the app you were connecting.
        </p>
      </div>
    </main>
  ),
});

function Consent() {
  const { details, account } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "an app";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: decideError } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (decideError) {
      setBusy(false);
      return setError(decideError.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("No redirect was returned by the authorization server.");
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card px-6 py-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Blacktower™</p>
        <h1 className="mt-4 font-display text-2xl leading-tight tracking-tight">
          Connect {clientName} to Kelvin's Aide
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This lets {clientName} use this app's tools as you.
        </p>
        {account && (
          <p className="mt-4 font-mono text-xs text-muted-foreground">Signed in as {account}</p>
        )}

        {details?.client?.redirect_uris?.[0] && (
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
            Returns to {details.client.redirect_uris[0]}
          </p>
        )}

        {scopes.length > 0 && (
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            {scopes.map((scope) => (
              <li key={scope}>• {SCOPE_LABELS[scope] ?? `Additional permission requested: ${scope}`}</li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          This does not bypass the app's permissions — bot chat data stays admin-only.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
          >
            Cancel connection
          </button>
        </div>
      </div>
    </main>
  );
}
