import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fromDbMode, type ChatMode } from "@/lib/chat-modes";

export type DashboardThread = {
  id: string;
  title: string;
  mode: ChatMode;
  updated_at: string;
  telegram_chat_id: number | null;
  messages: number;
};

export type DashboardModeEvent = {
  id: string;
  thread_id: string | null;
  chat_id: number | null;
  from_mode: ChatMode | null;
  to_mode: ChatMode;
  source: "app" | "telegram";
  created_at: string;
};

export type DashboardDelivery = {
  id: string;
  thread_id: string | null;
  chat_id: number;
  direction: "outbound" | "inbound";
  status: "sent" | "failed";
  error: string | null;
  preview: string;
  created_at: string;
};

export type DashboardSnapshot = {
  threads: DashboardThread[];
  modeEvents: DashboardModeEvent[];
  deliveries: DashboardDelivery[];
  telegramChats: { chat_id: number; mode: ChatMode; turns: number; updated_at: string }[];
  stats: {
    threads: number;
    linked: number;
    sent24h: number;
    failed24h: number;
    switches24h: number;
  };
};

/** Everything the operator dashboard renders, in one authenticated read. */
export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardSnapshot> => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [threadsRes, messagesRes, modeRes, deliveryRes, tgRes] = await Promise.all([
      context.supabase
        .from("chat_threads")
        .select("id, title, mode, updated_at, telegram_chat_id")
        .eq("user_id", context.userId)
        .order("updated_at", { ascending: false })
        .limit(50),
      context.supabase.from("chat_messages").select("thread_id").eq("user_id", context.userId),
      context.supabase
        .from("mode_events")
        .select("id, thread_id, chat_id, from_mode, to_mode, source, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      context.supabase
        .from("telegram_deliveries")
        .select("id, thread_id, chat_id, direction, status, error, preview, created_at")
        .order("created_at", { ascending: false })
        .limit(60),
      context.supabase
        .from("telegram_chats")
        .select("chat_id, mode, history, updated_at")
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    const counts = new Map<string, number>();
    for (const row of messagesRes.data ?? []) {
      const key = String(row.thread_id);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const threads: DashboardThread[] = (threadsRes.data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      mode: fromDbMode(row.mode),
      updated_at: row.updated_at as string,
      telegram_chat_id: row.telegram_chat_id === null ? null : Number(row.telegram_chat_id),
      messages: counts.get(String(row.id)) ?? 0,
    }));

    const modeEvents: DashboardModeEvent[] = (modeRes.data ?? []).map((row) => ({
      id: row.id as string,
      thread_id: (row.thread_id as string | null) ?? null,
      chat_id: row.chat_id === null ? null : Number(row.chat_id),
      from_mode: row.from_mode === null ? null : fromDbMode(row.from_mode),
      to_mode: fromDbMode(row.to_mode),
      source: row.source === "telegram" ? "telegram" : "app",
      created_at: row.created_at as string,
    }));

    const deliveries: DashboardDelivery[] = (deliveryRes.data ?? []).map((row) => ({
      id: row.id as string,
      thread_id: (row.thread_id as string | null) ?? null,
      chat_id: Number(row.chat_id),
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      status: row.status === "failed" ? "failed" : "sent",
      error: (row.error as string | null) ?? null,
      preview: (row.preview as string | null) ?? "",
      created_at: row.created_at as string,
    }));

    const telegramChats = (tgRes.data ?? []).map((row) => ({
      chat_id: Number(row.chat_id),
      mode: fromDbMode(row.mode),
      turns: Array.isArray(row.history) ? row.history.length : 0,
      updated_at: String(row.updated_at),
    }));

    return {
      threads,
      modeEvents,
      deliveries,
      telegramChats,
      stats: {
        threads: threads.length,
        linked: threads.filter((t) => t.telegram_chat_id !== null).length,
        sent24h: deliveries.filter(
          (d) => d.status === "sent" && d.direction === "outbound" && d.created_at >= since,
        ).length,
        failed24h: deliveries.filter((d) => d.status === "failed" && d.created_at >= since).length,
        switches24h: modeEvents.filter((e) => e.created_at >= since).length,
      },
    };
  });
