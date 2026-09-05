import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OperatorRequest = {
  id: string;
  chat_id: number;
  telegram_username: string | null;
  name: string;
  company: string | null;
  purpose: string;
  preferred_time: string | null;
  contact: string | null;
  status: "pending" | "reviewed" | "closed";
  operator_note: string | null;
  created_at: string;
};

/** Enquiries submitted through the Telegram mini app. Operators only (RLS). */
export const listOperatorRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperatorRequest[]> => {
    const { data, error } = await context.supabase
      .from("visitor_requests")
      .select(
        "id, chat_id, telegram_username, name, company, purpose, preferred_time, contact, status, operator_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("listOperatorRequests failed:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      chat_id: Number(row.chat_id),
      telegram_username: (row.telegram_username as string | null) ?? null,
      name: String(row.name),
      company: (row.company as string | null) ?? null,
      purpose: String(row.purpose),
      preferred_time: (row.preferred_time as string | null) ?? null,
      contact: (row.contact as string | null) ?? null,
      status: row.status as OperatorRequest["status"],
      operator_note: (row.operator_note as string | null) ?? null,
      created_at: String(row.created_at),
    }));
  });

/** Marks an enquiry reviewed or closed, optionally with an internal note. */
export const updateRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "reviewed", "closed"]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("visitor_requests")
      .update({
        status: data.status,
        ...(data.note === undefined ? {} : { operator_note: data.note || null }),
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
