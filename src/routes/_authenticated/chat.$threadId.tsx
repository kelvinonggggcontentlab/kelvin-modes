import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, MessageSquare, Send, Link2, Link2Off } from "lucide-react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CHAT_MODES, MODE_META, type ChatMode } from "@/lib/chat-modes";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  setThreadMode,
} from "@/lib/chat.functions";
import {
  linkThreadToTelegram,
  listTelegramChats,
  relayToTelegram,
} from "@/lib/telegram.functions";
import { Input } from "@/components/ui/input";
import mark from "@/assets/blacktower-mark.png";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "BLACKTOWER™ chat console" },
      {
        name: "description",
        content:
          "Chat with the BLACKTOWER™ voices — TOWER the house desk, the office secretary, Kelvin's own Manglish register, and NEXUS the trend-talker. Saved threads, switchable modes.",
      },
      { property: "og:title", content: "BLACKTOWER™ chat console" },
      {
        property: "og:description",
        content:
          "Four Malaysian Chinese / Manglish voices, one console. Saved conversation threads with per-thread mode switching.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
  errorComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">
      This conversation could not be loaded.{" "}
      <Link className="underline" to="/chat">
        Back to chat
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">
      Conversation not found.{" "}
      <Link className="underline" to="/chat">
        Back to chat
      </Link>
    </div>
  ),
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const threadsQuery = useQuery({ queryKey: ["chat-threads"], queryFn: () => listThreads() });
  const threadQuery = useQuery({
    queryKey: ["chat-thread", threadId],
    queryFn: () => getThread({ data: { threadId } }),
  });

  const newThread = useMutation({
    mutationFn: () => createThread({ data: { mode: "tower" } }),
    onSuccess: async (thread) => {
      await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeThread = useMutation({
    mutationFn: (id: string) => deleteThread({ data: { threadId: id } }),
    onSuccess: async (_result, id) => {
      const remaining = (threadsQuery.data ?? []).filter((t) => t.id !== id);
      await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      if (id === threadId) {
        if (remaining[0]) {
          navigate({ to: "/chat/$threadId", params: { threadId: remaining[0].id } });
        } else {
          navigate({ to: "/chat" });
        }
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeMode = useMutation({
    mutationFn: (mode: ChatMode) => setThreadMode({ data: { threadId, mode } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat-thread", threadId] }),
        queryClient.invalidateQueries({ queryKey: ["chat-threads"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const telegramChatsQuery = useQuery({
    queryKey: ["telegram-chats"],
    queryFn: () => listTelegramChats(),
  });

  const link = useMutation({
    mutationFn: (telegramChatId: number | null) =>
      linkThreadToTelegram({ data: { threadId, telegramChatId } }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat-thread", threadId] }),
        queryClient.invalidateQueries({ queryKey: ["chat-threads"] }),
      ]);
      toast.success(
        result.telegramChatId === null
          ? "Unlinked from Telegram."
          : `Linked to Telegram chat ${result.telegramChatId}.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mode: ChatMode = threadQuery.data?.thread.mode ?? "tower";

  const initialMessages: UIMessage[] = useMemo(
    () =>
      (threadQuery.data?.messages ?? []).map((row) => ({
        id: row.id,
        role: row.role,
        parts: [{ type: "text" as const, text: row.content }],
      })),
    [threadQuery.data],
  );

  if (threadQuery.isLoading) {
    return (
      <Shell
        threads={threadsQuery.data ?? []}
        activeId={threadId}
        onNew={() => newThread.mutate()}
        onDelete={(id) => removeThread.mutate(id)}
      >
        <div className="flex flex-1 items-center justify-center">
          <Shimmer>Loading thread…</Shimmer>
        </div>
      </Shell>
    );
  }

  if (!threadQuery.data) {
    return (
      <Shell
        threads={threadsQuery.data ?? []}
        activeId={threadId}
        onNew={() => newThread.mutate()}
        onDelete={(id) => removeThread.mutate(id)}
      >
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          This conversation is not yours, or it no longer exists.
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      threads={threadsQuery.data ?? []}
      activeId={threadId}
      onNew={() => newThread.mutate()}
      onDelete={(id) => removeThread.mutate(id)}
    >
      <ChatWindow
        key={threadId}
        threadId={threadId}
        mode={mode}
        initialMessages={initialMessages}
        onModeChange={(next) => changeMode.mutate(next)}
        onFirstMessage={() => queryClient.invalidateQueries({ queryKey: ["chat-threads"] })}
        telegramChatId={threadQuery.data.thread.telegram_chat_id}
        telegramChats={telegramChatsQuery.data ?? []}
        onLink={(id) => link.mutate(id)}
        linkPending={link.isPending}
      />
    </Shell>
  );
}

function Shell({
  threads,
  activeId,
  onNew,
  onDelete,
  children,
}: {
  threads: { id: string; title: string; mode: ChatMode }[];
  activeId: string;
  onNew: () => void;
  onDelete: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <main className="flex h-screen bg-background text-foreground">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
        <div className="flex items-center gap-3 border-b border-border px-4 py-4">
          <img src={mark} alt="BLACKTOWER emblem" width={32} height={32} className="h-8 w-8" />
          <div className="min-w-0">
            <p className="font-display text-sm tracking-[0.2em] uppercase">BLACKTOWER™</p>
            <p className="truncate text-xs text-muted-foreground">Chat console</p>
          </div>
        </div>

        <div className="p-3">
          <Button className="w-full justify-start gap-2" onClick={onNew} variant="secondary">
            <Plus className="h-4 w-4" /> New conversation
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {threads.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {threads.map((thread) => (
                <li
                  key={thread.id}
                  className={`group flex items-center gap-1 rounded-md px-1 ${
                    thread.id === activeId ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <Link
                    to="/chat/$threadId"
                    params={{ threadId: thread.id }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{thread.title}</span>
                      <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                        {MODE_META[thread.mode].label}
                      </span>
                    </span>
                  </Link>
                  <Button
                    aria-label={`Delete ${thread.title}`}
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => onDelete(thread.id)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="border-t border-border p-3 text-xs">
          <Link className="text-muted-foreground hover:text-foreground" to="/admin">
            Operator panel →
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </main>
  );
}

function ChatWindow({
  threadId,
  mode,
  initialMessages,
  onModeChange,
  onFirstMessage,
  telegramChatId,
  telegramChats,
  onLink,
  linkPending,
}: {
  threadId: string;
  mode: ChatMode;
  initialMessages: UIMessage[];
  onModeChange: (mode: ChatMode) => void;
  onFirstMessage: () => void;
  telegramChatId: number | null;
  telegramChats: { chat_id: number; turns: number; business_chat: boolean }[];
  onLink: (telegramChatId: number | null) => void;
  linkPending: boolean;
}) {
  const linked = telegramChatId !== null;
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        body: { threadId },
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (error: Error) => toast.error(error.message || "The assistant could not answer."),
  });

  // A linked thread is a live Telegram relay: messages go to the person on the
  // other end, and their replies are mirrored in by the webhook, so poll.
  const relayQuery = useQuery({
    queryKey: ["chat-thread", threadId, "relay"],
    queryFn: () => getThread({ data: { threadId } }),
    enabled: linked,
    refetchInterval: linked ? 5000 : false,
  });

  const relay = useMutation({
    mutationFn: (text: string) => relayToTelegram({ data: { threadId, text } }),
    onSuccess: async () => {
      await relayQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const relayMessages: UIMessage[] = useMemo(
    () =>
      (relayQuery.data?.messages ?? []).map((row) => ({
        id: row.id,
        role: row.role,
        parts: [{ type: "text" as const, text: row.content }],
      })),
    [relayQuery.data],
  );

  const shown = linked ? (relayQuery.data ? relayMessages : initialMessages) : messages;
  const busy = linked ? relay.isPending : status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);

  const submit = (_message: unknown, event: { preventDefault: () => void }) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    if (linked) {
      setInput("");
      relay.mutate(text);
      return;
    }
    const first = messages.length === 0;
    setInput("");
    void sendMessage({ text });
    if (first) onFirstMessage();
  };

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto min-w-0">
          <p className="font-display text-sm uppercase tracking-[0.2em]">
            {MODE_META[mode].label}
          </p>
          <p className="truncate text-xs text-muted-foreground">{MODE_META[mode].blurb}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {CHAT_MODES.map((option) => (
            <Button
              key={option}
              onClick={() => option !== mode && onModeChange(option)}
              size="sm"
              variant={option === mode ? "default" : "outline"}
            >
              {MODE_META[option].label}
            </Button>
          ))}
        </div>
      </header>

      <TelegramBar
        chats={telegramChats}
        linkedChatId={telegramChatId}
        onLink={onLink}
        pending={linkPending}
      />

      <Conversation className="flex-1">
        <ConversationContent>
          {shown.length === 0 ? (
            <ConversationEmptyState
              description={
              linked
                ? `Relaying to Telegram chat ${telegramChatId}. What you type is sent to them as the bot.`
                : `Speaking as ${MODE_META[mode].label}. ${MODE_META[mode].blurb}`
            }
              icon={
                <img
                  src={mark}
                  alt="BLACKTOWER emblem"
                  width={64}
                  height={64}
                  loading="lazy"
                  className="h-16 w-16"
                />
              }
              title="Start the conversation"
            />
          ) : (
            shown.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {!linked && status === "submitted" ? (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking…</Shimmer>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-4">
        <PromptInput onSubmit={submit}>
          <PromptInputTextarea
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder={
              linked ? `Send to Telegram chat ${telegramChatId}…` : `Message ${MODE_META[mode].label}…`
            }
            ref={textareaRef}
            value={input}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              disabled={!input.trim() || busy}
              status={linked ? (relay.isPending ? "submitted" : "ready") : status}
            >
              {linked ? <Send className="h-4 w-4" /> : undefined}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

function TelegramBar({
  chats,
  linkedChatId,
  onLink,
  pending,
}: {
  chats: { chat_id: number; turns: number; business_chat: boolean }[];
  linkedChatId: number | null;
  onLink: (telegramChatId: number | null) => void;
  pending: boolean;
}) {
  const [manual, setManual] = useState("");

  if (linkedChatId !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/40 px-4 py-2 text-xs">
        <Link2 className="h-3.5 w-3.5" />
        <span className="font-medium">Live relay</span>
        <span className="text-muted-foreground">
          Telegram chat {linkedChatId} · your messages are delivered as the bot, and the bot&apos;s
          auto-replies are paused for this chat.
        </span>
        <Button
          className="ml-auto gap-1"
          disabled={pending}
          onClick={() => onLink(null)}
          size="sm"
          variant="outline"
        >
          <Link2Off className="h-3.5 w-3.5" /> Unlink
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
      <span className="text-muted-foreground">Link to Telegram:</span>
      {chats.length > 0 ? (
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          defaultValue=""
          disabled={pending}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value) onLink(Number(value));
          }}
        >
          <option value="">Known chats…</option>
          {chats.map((chat) => (
            <option key={chat.chat_id} value={chat.chat_id}>
              {chat.chat_id} · {chat.turns} turns{chat.business_chat ? " · business" : ""}
            </option>
          ))}
        </select>
      ) : null}
      <Input
        className="h-8 w-40 text-xs"
        inputMode="numeric"
        onChange={(event) => setManual(event.currentTarget.value)}
        placeholder="Or paste chat ID"
        value={manual}
      />
      <Button
        disabled={pending || !/^-?\d+$/.test(manual.trim())}
        onClick={() => onLink(Number(manual.trim()))}
        size="sm"
        variant="secondary"
      >
        Link
      </Button>
    </div>
  );
}
