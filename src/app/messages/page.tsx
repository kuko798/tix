import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/marketplace/empty-state";
import { requireSessionUser } from "@/lib/session";
import { queryThreadsForUser } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AppFrame, PageIntro } from "@/components/brand/page-intro";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requireSessionUser();
  const messageThreads = await queryThreadsForUser(user.id);

  return (
    <AppFrame width="medium">
      <PageIntro title="Messages">
        Every conversation is tied to a listing or trade, so context never gets lost.
      </PageIntro>

      {messageThreads.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={MessagesSquare}
          title="No conversations yet"
          description="Messages start when you make an offer or reply to a tickets-wanted request."
        />
      ) : (
        <div className="mt-6 divide-y divide-border border-y border-border">
          {messageThreads.map((thread) => {
            const lastMessage = thread.messages[thread.messages.length - 1];
            return (
              <Link
                key={thread.id}
                href={`/messages/${thread.id}`}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 py-5 transition-colors hover:border-primary"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback>{thread.otherUser.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("font-display truncate text-xl uppercase leading-none", thread.unread ? "text-primary" : "font-medium")}>
                      {thread.otherUser.displayName}
                    </p>
                    {thread.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {lastMessage
                      ? `${lastMessage.kind === "system" ? "System: " : ""}${lastMessage.body}`
                      : "No messages yet"}
                  </p>
                </div>
                {lastMessage && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(lastMessage.sentAt)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </AppFrame>
  );
}
