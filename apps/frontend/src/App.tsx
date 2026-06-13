import type { FormEvent } from "react";
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { TutorUIMessage } from "@tuteur/shared";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatEmptyState } from "@/components/EmptyState";
import { MessageBubble } from "@/components/MessageBubble";

const transport = new DefaultChatTransport<TutorUIMessage>({ api: "/api/chat" });

export default function App() {
  const { messages, sendMessage, status } = useChat<TutorUIMessage>({
    transport,
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-4">
      <header className="flex items-center gap-3 py-6">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Tuteur IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Révise tes leçons, à ton rythme.
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {messages.length === 0 && <ChatEmptyState />}
        {messages.map((message) => {
          const role = message.role === "user" ? "user" : "assistant";
          return message.parts.map((part, index) => {
            switch (part.type) {
              case "text":
                return (
                  <MessageBubble key={`${message.id}-${index}`} role={role}>
                    {part.text}
                  </MessageBubble>
                );
              default:
                return null;
            }
          });
        })}
      </div>

      <form className="flex items-center gap-2 py-4" onSubmit={submit}>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Écris un message…"
          disabled={busy}
        />
        <Button type="submit" size="icon" disabled={busy} aria-label="Envoyer">
          <Send />
        </Button>
      </form>
    </div>
  );
}
