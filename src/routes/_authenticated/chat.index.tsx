import { createFileRoute, redirect } from "@tanstack/react-router";
import { createThread, listThreads } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/chat/")({
  loader: async () => {
    const threads = await listThreads();
    const target = threads[0] ?? (await createThread({ data: { mode: "tower" } }));
    throw redirect({ to: "/chat/$threadId", params: { threadId: target.id } });
  },
  component: () => null,
});
