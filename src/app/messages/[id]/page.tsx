"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toast } from "sonner";
import { Ban, Flag, MoreVertical, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { blockUserAction, markThreadReadAction, reportMessageAction, sendMessageAction } from "@/lib/actions";
import { messageLooksUnsafe } from "@/lib/initials";
import { formatRelativeTime } from "@/lib/format";
import { useSession } from "@/lib/auth-client";
import type { Message, MessageThread } from "@/lib/types";
import { cn } from "@/lib/utils";

function MessageThreadContent({ threadId }: { threadId: string }) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const streamThreadId = thread?.id;
  const lastMessageId = thread?.messages.at(-1)?.id ?? "";

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/messages/${threadId}`, { cache: "no-store" })
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setMissing(true);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data: MessageThread | null) => {
        if (!cancelled && data) {
          setThread(data);
          markThreadReadAction(threadId).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    if (!streamThreadId) return;
    const source = new EventSource(`/api/messages/${threadId}/events?after=${encodeURIComponent(lastMessageId)}`);
    source.onmessage = (event) => {
      const message = JSON.parse(event.data) as Message;
      setThread((current) => {
        if (!current || current.messages.some((item) => item.id === message.id)) return current;
        return { ...current, messages: [...current.messages, message] };
      });
      void markThreadReadAction(threadId);
    };
    return () => source.close();
  }, [lastMessageId, streamThreadId, threadId]);

  if (missing) notFound();
  if (!thread || !currentUserId) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading conversation…</div>;
  }

  const other = thread.otherUser;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !thread) return;
    if (messageLooksUnsafe(draft)) {
      toast.error(
        "That message looks like it contains payment info, a card number, or a barcode/QR reference. Remove it to send."
      );
      return;
    }
    setSending(true);
    try {
      const message = await sendMessageAction(thread.id, draft);
      setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-2xl flex-col px-4 sm:px-6 lg:px-8 md:h-[calc(100dvh-4rem)]">
      <div className="flex items-center justify-between border-b border-border py-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{other.initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{other.displayName}</p>
            {thread.tradeId && (
              <Link href={`/trades/${thread.tradeId}`} className="text-xs text-muted-foreground hover:text-foreground">
                View trade
              </Link>
            )}
            {thread.listingId && !thread.tradeId && (
              <Link href={`/listing/${thread.listingId}`} className="text-xs text-muted-foreground hover:text-foreground">
                View listing
              </Link>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Conversation options">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={async () => {
                const message = [...thread.messages].reverse().find((item) => item.kind === "user" && item.senderId === other.id);
                if (!message) return toast.error("There is no message to report.");
                try {
                  await reportMessageAction(message.id, "Reported from conversation menu");
                  toast("Report submitted for moderator review");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not submit the report.");
                }
              }}
              className="gap-2"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden />
              Report {other.displayName.split(" ")[0]}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await blockUserAction(other.id);
                  toast(`${other.displayName.split(" ")[0]} blocked`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not block this account.");
                }
              }}
              className="gap-2 text-destructive"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden />
              Block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {thread.messages.map((message: Message) => {
          if (message.kind === "system") {
            return (
              <div key={message.id} className="flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
                  {message.body}
                </span>
              </div>
            );
          }
          const isMe = message.senderId === currentUserId;
          return (
            <div key={message.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm",
                  isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
              >
                <p>{message.body}</p>
                <p className={cn("mt-1 text-[10px]", isMe ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {formatRelativeTime(message.sentAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border py-4">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message"
          className="h-11"
          aria-label="Message"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="Send message" disabled={sending}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="pb-4 text-center text-xs text-muted-foreground">
        Never share card numbers, barcodes, or QR codes here. GameSwap will block messages that
        look like they contain them.
      </p>
    </div>
  );
}

export default function MessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MessageThreadContent threadId={id} />;
}
