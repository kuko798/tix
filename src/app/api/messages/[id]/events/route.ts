import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const participant = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId: id, userId: user.id } },
    select: { id: true },
  });
  if (!participant) return new Response("Not found", { status: 404 });
  const encoder = new TextEncoder();
  const url = new URL(request.url);
  const cursor = url.searchParams.get("after");
  const cursorMessage = cursor
    ? await prisma.message.findFirst({ where: { id: cursor, threadId: id }, select: { sentAt: true } })
    : null;
  let after = cursorMessage?.sentAt ?? new Date();
  let closed = false;
  request.signal.addEventListener("abort", () => { closed = true; });

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      const deadline = Date.now() + 25_000;
      while (!closed && Date.now() < deadline) {
        const messages = await prisma.message.findMany({
          where: { threadId: id, sentAt: { gt: after } },
          orderBy: { sentAt: "asc" },
          take: 100,
          select: { id: true, senderId: true, kind: true, body: true, sentAt: true },
        });
        for (const message of messages) {
          after = message.sentAt;
          controller.enqueue(encoder.encode(`id: ${message.id}\ndata: ${JSON.stringify({ ...message, sentAt: message.sentAt.toISOString() })}\n\n`));
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
