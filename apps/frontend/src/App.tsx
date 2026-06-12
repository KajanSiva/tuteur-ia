import { useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "error: backend unreachable" },
      ]);
    } finally {
      setLoading(false);
    }
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
        {messages.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            Dis-moi par exemple{" "}
            <span className="font-medium text-foreground">
              « fais-moi réviser la leçon 13 »
            </span>
            .
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm shadow-sm",
                m.role === "user"
                  ? "rounded-br-lg bg-primary text-primary-foreground"
                  : "rounded-bl-lg border border-border bg-card text-card-foreground",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex items-center gap-2 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écris un message…"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading} aria-label="Envoyer">
          <Send />
        </Button>
      </form>
    </div>
  );
}
