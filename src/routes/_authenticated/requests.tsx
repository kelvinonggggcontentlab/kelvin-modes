import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listOperatorRequests,
  updateRequestStatus,
  type OperatorRequest,
} from "@/lib/requests.functions";

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Incoming requests — BLACKTOWER™ desk" },
      {
        name: "description",
        content:
          "Enquiries submitted through the Telegram mini app, with who sent them, what they need and whether they have been reviewed.",
      },
      { property: "og:title", content: "Incoming requests — BLACKTOWER™ desk" },
      {
        property: "og:description",
        content: "Review and close enquiries sent from the Telegram mini app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestsPage,
  errorComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">Requests could not load.</div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">Not found.</div>,
});

function RequestsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["operator-requests"],
    queryFn: () => listOperatorRequests(),
    refetchInterval: 20_000,
  });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: { id: string; status: OperatorRequest["status"]; note?: string }) =>
      updateRequestStatus({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operator-requests"] }),
  });

  const requests = query.data ?? [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-5">
          <Inbox className="size-5" />
          <div className="flex-1">
            <h1 className="font-display text-xl uppercase tracking-wide">Incoming requests</h1>
            <p className="text-sm text-muted-foreground">
              Sent from the Telegram mini app by people messaging the bot.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="size-4" /> Dashboard
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          requests.map((request) => (
            <Card key={request.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <CardTitle className="text-base">
                  {request.name}
                  {request.company ? (
                    <span className="text-muted-foreground"> · {request.company}</span>
                  ) : null}
                </CardTitle>
                <Badge variant={request.status === "pending" ? "outline" : "secondary"}>
                  {request.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{request.purpose}</p>
                <p className="text-muted-foreground">
                  {request.preferred_time ? `Preferred: ${request.preferred_time} · ` : ""}
                  {request.contact ? `Contact: ${request.contact} · ` : ""}
                  {request.telegram_username ? `@${request.telegram_username} · ` : ""}
                  chat {request.chat_id} ·{" "}
                  {new Date(request.created_at).toLocaleString("en-MY", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-xs"
                    placeholder="Note back to them (optional)"
                    value={notes[request.id] ?? request.operator_note ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [request.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        id: request.id,
                        status: "reviewed",
                        note: notes[request.id] ?? request.operator_note ?? "",
                      })
                    }
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        id: request.id,
                        status: "closed",
                        note: notes[request.id] ?? request.operator_note ?? "",
                      })
                    }
                  >
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
