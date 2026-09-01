import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims: Record<string, unknown> };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function writeLog(entry: {
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target?: string | null;
  details?: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("access_logs").insert({
    actor_id: entry.actor_id,
    actor_email: entry.actor_email,
    action: entry.action,
    target: entry.target ?? null,
    details: JSON.parse(JSON.stringify(entry.details ?? {})),
  });
  if (error) console.error("access_logs insert failed:", error.message);
}

function emailOf(context: Ctx): string | null {
  const email = context.claims["email"];
  return typeof email === "string" ? email : null;
}

/** Who the caller is, and whether they hold the admin role. */
export const whoAmI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { userId: context.userId, email: emailOf(context), isAdmin: data === true };
  });

/** Records an in-app action in the access log. */
export const logAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().min(1).max(64),
        target: z.string().max(200).optional(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await writeLog({
      actor_id: context.userId,
      actor_email: emailOf(context),
      action: data.action,
      target: data.target ?? null,
      details: data.details ?? {},
    });
    return { ok: true };
  });

export type Operator = {
  id: string;
  email: string | null;
  roles: string[];
  created_at: string | null;
  last_sign_in_at: string | null;
};

/** Every account that can sign in, with the roles it holds. Admin only. */
export const listOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ operators: Operator[] }> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: users, error: usersError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        supabaseAdmin.from("user_roles").select("user_id, role"),
      ]);

    if (usersError) throw new Error(usersError.message);
    if (rolesError) throw new Error(rolesError.message);

    const byUser = new Map<string, string[]>();
    for (const row of roles ?? []) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row.role);
      byUser.set(row.user_id, list);
    }

    return {
      operators: (users?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? null,
        roles: (byUser.get(u.id) ?? []).sort(),
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })),
    };
  });

/** Grants or revokes a role. Admin only; the last admin cannot be demoted. */
export const setOperatorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "user"]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.grant && data.role === "admin") {
      const { data: admins, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (error) throw new Error(error.message);
      if ((admins ?? []).length <= 1) {
        throw new Error("Cannot revoke the last admin — grant admin to another account first.");
      }
    }

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }

    await writeLog({
      actor_id: context.userId,
      actor_email: emailOf(context as Ctx),
      action: data.grant ? "role.grant" : "role.revoke",
      target: data.userId,
      details: { role: data.role },
    });

    return { ok: true };
  });

/** The access log, newest first. Admin only (enforced by RLS as well). */
export const listAccessLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("access_logs")
      .select("id, actor_id, actor_email, action, target, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { logs: data ?? [] };
  });

export type NoticeRow = {
  id: string;
  author_id: string;
  recipient_id: string;
  title: string;
  body: string;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  created_at: string;
  recipient_email?: string | null;
  author_email?: string | null;
};

/** Notices visible to the caller: all of them for admins, their own otherwise. */
export const listNotices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ notices: NoticeRow[] }> => {
    const { data, error } = await context.supabase
      .from("notices")
      .select(
        "id, author_id, recipient_id, title, body, acknowledged_at, acknowledgement_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const notices = (data ?? []) as NoticeRow[];
    const ids = [...new Set(notices.flatMap((n) => [n.author_id, n.recipient_id]))];
    if (ids.length === 0) return { notices };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const emails = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? null]));

    return {
      notices: notices.map((n) => ({
        ...n,
        author_email: emails.get(n.author_id) ?? null,
        recipient_email: emails.get(n.recipient_id) ?? null,
      })),
    };
  });

/** Issues a written notice to an operator. Admin only. */
export const issueNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        recipientId: z.string().uuid(),
        title: z.string().min(3).max(140),
        body: z.string().min(3).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inserted, error } = await supabaseAdmin
      .from("notices")
      .insert({
        author_id: context.userId,
        recipient_id: data.recipientId,
        title: data.title,
        body: data.body,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await writeLog({
      actor_id: context.userId,
      actor_email: emailOf(context as Ctx),
      action: "notice.issue",
      target: data.recipientId,
      details: { notice_id: inserted?.id, title: data.title },
    });

    return { ok: true, id: inserted?.id as string };
  });

/** The recipient acknowledges a notice addressed to them. */
export const acknowledgeNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), note: z.string().max(2000).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("notices")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledgement_note: data.note?.trim() || null,
      })
      .eq("id", data.id)
      .is("acknowledged_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Notice not found, already acknowledged, or not addressed to you.");

    await writeLog({
      actor_id: context.userId,
      actor_email: emailOf(context as Ctx),
      action: "notice.acknowledge",
      target: data.id,
      details: {},
    });

    return { ok: true };
  });
