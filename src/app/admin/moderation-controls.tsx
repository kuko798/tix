"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moderateAction } from "./actions";

export function ModerationControls({ targetType, targetId, actions }: { targetType: "report" | "evidence" | "dispute" | "listing" | "user" | "transaction"; targetId: string; actions: string[] }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required moderation reason" className="h-9" />
      <div className="flex gap-2">
        {actions.map((action) => <Button key={action} size="sm" variant="outline" disabled={pending || reason.trim().length < 5} onClick={() => startTransition(async () => {
          try { await moderateAction({ targetType, targetId, action, reason }); toast.success(`Marked ${action.replaceAll("_", " ")}`); setReason(""); }
          catch (error) { toast.error(error instanceof Error ? error.message : "Moderation action failed."); }
        })}>{action.replaceAll("_", " ")}</Button>)}
      </div>
    </div>
  );
}
