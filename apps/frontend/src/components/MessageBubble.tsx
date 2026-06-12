import type { ReactNode } from "react";
import { cva } from "class-variance-authority";

export type MessageRole = "user" | "assistant";

const rowVariants = cva("flex", {
  variants: {
    role: {
      user: "justify-end",
      assistant: "justify-start",
    },
  },
  defaultVariants: { role: "assistant" },
});

const bubbleVariants = cva(
  "max-w-[80%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm shadow-sm",
  {
    variants: {
      role: {
        user: "rounded-br-lg bg-primary text-primary-foreground",
        assistant:
          "rounded-bl-lg border border-border bg-card text-card-foreground",
      },
    },
    defaultVariants: { role: "assistant" },
  },
);

export function MessageBubble({
  role,
  children,
}: {
  role: MessageRole;
  children: ReactNode;
}) {
  return (
    <div className={rowVariants({ role })}>
      <div className={bubbleVariants({ role })}>{children}</div>
    </div>
  );
}
