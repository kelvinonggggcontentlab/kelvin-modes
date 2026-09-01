import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  acknowledgeNotice,
  issueNotice,
  listAccessLogs,
  listNotices,
  listOperators,
  setOperatorRole,
  whoAmI,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Operator panel · BLACKTOWER™" },
      {
        name: "description",
        content:
          "BLACKTOWER™ operator panel — manage operator roles, review the access log, and issue written notices with acknowledgement.",
      },
      { property: "og:title", content: "Operator panel · BLACKTOWER™" },
      {
        property: "og:description",
        content: "Roles, access log and written notices for the BLACKTOWER™ representative bot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPanel;
});

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function Card({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card px-6 py-7">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-[10px] tracking-[0.25em] text-accent">{tag}</span>
        <h2 className="font-display text-xl tracking-tight">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AdminPanel() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["whoami"], queryFn: useServerFn(whoAmI) });
  const isAdmin = me.data?.isAdmin === true;

  const operatorsFn = useServerFn(listOperators);
  const logsFn = useServerFn(listAccessLogs);
  const noticesFn = useServerFn(listNotices);

  const operators = useQuery({
    queryKey: ["operators"],
    queryFn: operatorsFn,
    enabled: isAdmin,
  });
  const logs = useQuery({ queryKey: ["access-logs"], queryFn: logsFn, enabled: isAdmin });
  const notices = useQuery({ queryKey: ["notices"], queryFn: noticesFn, enabled: !!me.data });

  const roleFn = useServerFn(setOperatorRole);
  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "user"; grant: boolean }) =>
      roleFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["operators"] });
      void queryClient.invalidateQueries({ queryKey: ["access-logs"] });
    },
  });

  const issueFn = useServerFn(issueNotice);
  const [recipientId, setRecipientId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const issueMutation = useMutation({
    mutationFn: (vars: { recipientId: string; title: string; body: string }) =>
      issueFn({ data: vars }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["notices"] });
      void queryClient.invalidateQueries({ queryKey: ["access-logs"] });
    },
  });

  const ackFn = useServerFn(acknowledgeNotice);
  const [ackNote, setAckNote] = useState<Record<string, string>>({});
  const ackMutation = useMutation({
    mutationFn: (vars: { id: string; note?: string }) => ackFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notices"] });
      void queryClient.invalidateQueries({ queryKey: ["access-logs"] });
    },
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    window.location.replace("/auth");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-accent">
              Blacktower™ / Operators
            </p>
            <h1 className="mt-4 font-display text-3xl tracking-tight sm:text-4xl">
              Operator panel
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {me.data?.email ?? "…"} · {isAdmin ? "admin" : "operator"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              Home
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        </div>

        {!isAdmin && !me.isPending && (
          <p className="mt-8 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            You are signed in as an operator without the admin role. You can read and acknowledge
            notices addressed to you; roles and the access log are admin-only.
          </p>
        )}

        <div className="mt-10 space-y-6">
          {isAdmin && (
            <Card tag="SECTION 01" title="Operator roles">
              {operators.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
              {operators.error && (
                <p className="text-sm text-destructive">{String(operators.error.message)}</p>
              )}
              <ul className="divide-y divide-border">
                {(operators.data?.operators ?? []).map((op) => {
                  const admin = op.roles.includes("admin");
                  return (
                    <li
                      key={op.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{op.email ?? op.id}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {op.roles.length ? op.roles.join(", ") : "no role"} · last sign-in{" "}
                          {fmt(op.last_sign_in_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={roleMutation.isPending}
                        onClick={() =>
                          roleMutation.mutate({ userId: op.id, role: "admin", grant: !admin })
                        }
                        className="rounded-md border border-border px-3 py-1.5 font-mono text-xs hover:bg-secondary disabled:opacity-60"
                      >
                        {admin ? "Revoke admin" : "Grant admin"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {roleMutation.error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {String(roleMutation.error.message)}
                </p>
              )}
            </Card>
          )}

          <Card tag="SECTION 02" title="Notices">
            {isAdmin && (
              <form
                className="mb-6 space-y-3 rounded-md border border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  issueMutation.mutate({ recipientId, title, body });
                }}
              >
                <select
                  required
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">Select recipient…</option>
                  {(operators.data?.operators ?? []).map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.email ?? op.id}
                    </option>
                  ))}
                </select>
                <input
                  required
                  minLength={3}
                  maxLength={140}
                  placeholder="Notice title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <textarea
                  required
                  minLength={3}
                  maxLength={4000}
                  rows={4}
                  placeholder="What the notice says, and what you expect to happen next."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={issueMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  Issue notice
                </button>
                {issueMutation.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {String(issueMutation.error.message)}
                  </p>
                )}
              </form>
            )}

            {notices.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
            {(notices.data?.notices ?? []).length === 0 && !notices.isPending && (
              <p className="text-sm text-muted-foreground">No notices yet.</p>
            )}
            <ul className="space-y-4">
              {(notices.data?.notices ?? []).map((n) => {
                const mine = n.recipient_id === me.data?.userId;
                return (
                  <li key={n.id} className="rounded-md border border-border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-base tracking-tight">{n.title}</h3>
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                        {n.acknowledged_at ? "Acknowledged" : "Awaiting acknowledgement"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      to {n.recipient_email ?? n.recipient_id} · from{" "}
                      {n.author_email ?? n.author_id} · {fmt(n.created_at)}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>

                    {n.acknowledged_at ? (
                      <p className="mt-3 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
                        Acknowledged {fmt(n.acknowledged_at)}
                        {n.acknowledgement_note ? ` — “${n.acknowledgement_note}”` : ""}
                      </p>
                    ) : mine ? (
                      <form
                        className="mt-4 space-y-2 border-t border-border pt-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          ackMutation.mutate({ id: n.id, note: ackNote[n.id] });
                        }}
                      >
                        <textarea
                          rows={2}
                          maxLength={2000}
                          placeholder="Optional response (recorded with your acknowledgement)"
                          value={ackNote[n.id] ?? ""}
                          onChange={(e) =>
                            setAckNote((prev) => ({ ...prev, [n.id]: e.target.value }))
                          }
                          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                        />
                        <button
                          type="submit"
                          disabled={ackMutation.isPending}
                          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs hover:bg-secondary disabled:opacity-60"
                        >
                          Acknowledge
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {ackMutation.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {String(ackMutation.error.message)}
              </p>
            )}
          </Card>

          {isAdmin && (
            <Card tag="SECTION 03" title="Access log">
              {logs.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
              {(logs.data?.logs ?? []).length === 0 && !logs.isPending && (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              )}
              <ul className="divide-y divide-border">
                {(logs.data?.logs ?? []).map((l: Record<string, any>) => (
                  <li key={l["id"]} className="py-3">
                    <p className="font-mono text-xs">
                      <span className="text-accent">{l["action"]}</span>{" "}
                      <span className="text-muted-foreground">
                        {l["actor_email"] ?? l["actor_id"] ?? "system"}
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {fmt(l["created_at"])}
                      {l["target"] ? ` · target ${l["target"]}` : ""}
                      {l["details"] && Object.keys(l["details"]).length
                        ? ` · ${JSON.stringify(l["details"])}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
