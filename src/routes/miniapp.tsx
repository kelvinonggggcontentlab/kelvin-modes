import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listVisitorRequests,
  submitVisitorRequest,
  type VisitorRequestView,
} from "@/lib/miniapp.functions";

export const Route = createFileRoute("/miniapp")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Send a request — BLACKTOWER™ desk" },
      {
        name: "description",
        content:
          "Submit an enquiry to Kelvin's desk from inside Telegram: who you are, what it is about, when suits you, and how to reach you.",
      },
      { property: "og:title", content: "Send a request — BLACKTOWER™ desk" },
      {
        property: "og:description",
        content: "A short form to reach Kelvin's desk, with a status view for what you sent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MiniApp,
  errorComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">This page could not load.</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

type TgUser = { id: number; username?: string; first_name?: string; last_name?: string };
type TgWebApp = {
  ready: () => void;
  expand: () => void;
  initDataUnsafe?: { user?: TgUser };
  colorScheme?: string;
};

function useTelegram() {
  const [webApp, setWebApp] = useState<TgWebApp | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const attach = () => {
      const app = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
      if (app) {
        app.ready();
        app.expand();
        setWebApp(app);
      }
      setLoaded(true);
    };

    if ((window as unknown as { Telegram?: unknown }).Telegram) {
      attach();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = attach;
    script.onerror = attach;
    document.head.appendChild(script);
  }, []);

  return { webApp, loaded, user: webApp?.initDataUnsafe?.user ?? null };
}

const STATUS_LABEL: Record<VisitorRequestView["status"], string> = {
  pending: "Waiting for review",
  reviewed: "Reviewed by Kelvin",
  closed: "Closed",
};

function MiniApp() {
  const { loaded, user } = useTelegram();
  const [tab, setTab] = useState<"form" | "status">("form");
  const [requests, setRequests] = useState<VisitorRequestView[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [purpose, setPurpose] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [contact, setContact] = useState("");

  useEffect(() => {
    if (user && !name) {
      setName([user.first_name, user.last_name].filter(Boolean).join(" "));
    }
  }, [user, name]);

  const refresh = async (chatId: number) => {
    setRequests(await listVisitorRequests({ data: { chatId } }));
  };

  useEffect(() => {
    if (user) void refresh(user.id);
  }, [user]);

  const submit = async () => {
    if (!user) return;
    setError(null);
    if (name.trim().length < 2 || purpose.trim().length < 5) {
      setError("Please give your name and a short line about what this is regarding.");
      return;
    }
    setSending(true);
    try {
      await submitVisitorRequest({
        data: {
          chatId: user.id,
          telegramUserId: user.id,
          username: user.username ?? null,
          name: name.trim(),
          company: company.trim(),
          purpose: purpose.trim(),
          preferredTime: preferredTime.trim(),
          contact: contact.trim(),
        },
      });
      setSent(true);
      setPurpose("");
      setPreferredTime("");
      await refresh(user.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not send the request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            BLACKTOWER™ desk
          </p>
          <h1 className="font-display text-2xl uppercase tracking-wide">Send a request</h1>
          <p className="text-sm text-muted-foreground">
            The desk records your request and passes it to Kelvin. Nothing is confirmed, priced or
            approved here.
          </p>
        </header>

        <div className="flex gap-2">
          <Button
            variant={tab === "form" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("form")}
          >
            New request
          </Button>
          <Button
            variant={tab === "status" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("status")}
          >
            My requests {requests.length > 0 ? `(${requests.length})` : ""}
          </Button>
        </div>

        {loaded && !user ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Open this page from the menu button inside the Telegram chat with the bot, so the desk
              knows who to reply to.
            </CardContent>
          </Card>
        ) : null}

        {tab === "form" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Company (optional)</Label>
                <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purpose">What is it regarding?</Label>
                <Textarea
                  id="purpose"
                  rows={4}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Short summary of what you need"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time">Preferred time (optional)</Label>
                <Input
                  id="time"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  placeholder="e.g. weekday evenings, JB time"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact">Contact (optional)</Label>
                <Input
                  id="contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Phone or email"
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {sent ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4" /> Sent. Kelvin will review and confirm.
                </p>
              ) : null}

              <Button className="w-full" disabled={!user || sending} onClick={() => void submit()}>
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send to the desk
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What you sent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={request.status === "pending" ? "outline" : "secondary"}>
                        {STATUS_LABEL[request.status]}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {new Date(request.created_at).toLocaleString("en-MY", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{request.purpose}</p>
                    {request.operator_note ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Reply: {request.operator_note}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
