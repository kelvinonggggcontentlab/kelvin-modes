import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MODE_META, type ChatMode } from "@/lib/chat-modes";
import { getDashboard, type DashboardSnapshot } from "@/lib/dashboard.functions";
import logo from "@/assets/blacktower-logo.jpg.asset.json";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "BLACKTOWER™ operations dashboard" },
      {
        name: "description",
        content:
          "Live view of BLACKTOWER™ chat threads, voice mode switches and Telegram delivery status, with alerts when a send to Telegram fails.",
      },
      { property: "og:title", content: "BLACKTOWER™ operations dashboard" },
      {
        property: "og:description",
        content:
          "Chat threads, mode switches and Telegram delivery health for the BLACKTOWER™ bot in one console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
  errorComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">
      The dashboard could not load.{" "}
      <Link className="underline" to="/chat">
        Back to chat
      </Link>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">Not found.</div>,
});

const time = (value: string) =>
  new Date(value).toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function modeLabel(mode: ChatMode | null) {
  return mode ? MODE_META[mode].label : "—";
}

function DashboardPage() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(),
    refetchInterval: 15_000,
  });

  const data: DashboardSnapshot | undefined = query.data;
  const failures = (data?.deliveries ?? []).filter((d) => d.status === "failed");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-5">
          <img
            src={logo.url}
            alt="BLACKTOWER emblem"
            width={48}
            height={48}
            className="h-12 w-12 rounded-md object-cover"
          />
          <div className="mr-auto">
            <h1 className="font-display text-lg uppercase tracking-[0.25em]">
              BLACKTOWER™ operations
            </h1>
            <p className="text-xs text-muted-foreground">
              Threads, voice switches and Telegram delivery health · refreshes every 15s
            </p>
          </div>
          <Button
            disabled={query.isFetching}
            onClick={() => query.refetch()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/chat">Chat console</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/requests">Requests</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/admin">Operator panel</Link>
          </Button>

        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {failures.length > 0 ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {failures.length} Telegram {failures.length === 1 ? "send" : "sends"} failed
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 space-y-1 text-xs">
                {failures.slice(0, 5).map((failure) => (
                  <li key={failure.id}>
                    Chat {failure.chat_id} · {time(failure.created_at)} ·{" "}
                    {failure.error ?? "no error detail"}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Delivery healthy</AlertTitle>
            <AlertDescription>No failed Telegram sends on record.</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Threads" value={data?.stats.threads} />
          <Stat label="Linked to Telegram" value={data?.stats.linked} />
          <Stat label="Sent · 24h" value={data?.stats.sent24h} />
          <Stat label="Failed · 24h" value={data?.stats.failed24h} tone="danger" />
          <Stat label="Mode switches · 24h" value={data?.stats.switches24h} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest">Chat threads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.threads ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No threads yet.</p>
              ) : (
                (data?.threads ?? []).map((thread) => (
                  <Link
                    key={thread.id}
                    to="/chat/$threadId"
                    params={{ threadId: thread.id }}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{thread.title}</span>
                      <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                        {MODE_META[thread.mode].label} · {thread.messages} messages ·{" "}
                        {time(thread.updated_at)}
                      </span>
                    </span>
                    {thread.telegram_chat_id !== null ? (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Send className="h-3 w-3" /> {thread.telegram_chat_id}
                      </Badge>
                    ) : null}
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest">Mode switches</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.modeEvents ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No switches recorded yet.</p>
              ) : (
                (data?.modeEvents ?? []).map((event) => (
                  <div key={event.id} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {event.source}
                    </Badge>
                    <span className="font-medium">{modeLabel(event.from_mode)}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-medium">{modeLabel(event.to_mode)}</span>
                    <span className="ml-auto text-muted-foreground">
                      {event.chat_id !== null ? `chat ${event.chat_id} · ` : ""}
                      {time(event.created_at)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest">
                Telegram delivery log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.deliveries ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing relayed yet. Link a thread to a Telegram chat in the chat console.
                </p>
              ) : (
                (data?.deliveries ?? []).map((delivery) => (
                  <div
                    key={delivery.id}
                    className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2 text-xs last:border-0"
                  >
                    <Badge
                      variant={delivery.status === "failed" ? "destructive" : "secondary"}
                      className="text-[10px] uppercase"
                    >
                      {delivery.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {delivery.direction}
                    </Badge>
                    <span className="text-muted-foreground">chat {delivery.chat_id}</span>
                    <span className="min-w-0 flex-1 truncate">{delivery.preview}</span>
                    <span className="text-muted-foreground">{time(delivery.created_at)}</span>
                    {delivery.error ? (
                      <span className="w-full text-destructive">{delivery.error}</span>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest">
                Bot chats on Telegram
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.telegramChats ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Telegram conversations on record yet.
                </p>
              ) : (
                (data?.telegramChats ?? []).map((chat) => (
                  <div key={chat.chat_id} className="flex items-center gap-2 text-xs">
                    <span className="font-medium">chat {chat.chat_id}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {MODE_META[chat.mode].label}
                    </Badge>
                    <span className="text-muted-foreground">{chat.turns} turns of context</span>
                    <span className="ml-auto text-muted-foreground">{time(chat.updated_at)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone?: "danger";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p
          className={`font-display text-3xl ${
            tone === "danger" && (value ?? 0) > 0 ? "text-destructive" : ""
          }`}
        >
          {value ?? "—"}
        </p>
      </CardContent>
    </Card>
  );
}
