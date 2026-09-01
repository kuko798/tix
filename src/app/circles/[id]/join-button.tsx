"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinCircleAction } from "@/lib/actions";

export function JoinCircleButton({ circleId }: { circleId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      className="h-11 gap-1.5"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await joinCircleAction(circleId);
          toast("You're in this circle.");
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not join.");
        } finally {
          setPending(false);
        }
      }}
    >
      <UserPlus className="h-4 w-4" aria-hidden />
      {pending ? "Joining…" : "Join circle"}
    </Button>
  );
}
