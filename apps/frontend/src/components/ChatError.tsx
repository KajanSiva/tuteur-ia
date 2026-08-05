import { AlertCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

// A failed turn, shown in the transcript where the reply would have been. The
// backend sends text written for the child; a turn that leaves the thread with
// work pending can be replayed, so the retry stays one tap away.
export function ChatError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex max-w-[80%] flex-col gap-3 rounded-3xl rounded-bl-lg border border-destructive/30 bg-card p-4 shadow-sm"
    >
      <p className="flex items-start gap-2 text-sm text-card-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        {message}
      </p>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
        >
          <RotateCcw />
          Réessayer
        </Button>
      </div>
    </div>
  );
}
