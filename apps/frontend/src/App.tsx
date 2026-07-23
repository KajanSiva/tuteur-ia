import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type {
  ActionCommand,
  AuthUser,
  ChipAction,
  ConfirmOverwrite,
  TutorUIMessage,
} from "@tuteur/shared";
import { ImagePlus, Loader2, LogOut, Send, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatEmptyState } from "@/components/EmptyState";
import { MessageBubble } from "@/components/MessageBubble";

const transport = new DefaultChatTransport<TutorUIMessage>({ api: "/api/chat" });

// Sent alongside lesson photos when the child adds no caption — nudges the
// router toward the ingest intent rather than leaving the image unlabelled.
const DEFAULT_INGEST_TEXT = "Voici une nouvelle leçon, peux-tu la prendre en compte ?";

// Longest edge a lesson photo is scaled down to before upload. Matches the
// vision API's recommended max so we send the smallest image that stays legible
// — keeping payloads small (well under the body limit) and vision tokens cheap.
const MAX_IMAGE_EDGE = 1568;
const JPEG_QUALITY = 0.85;

// The backend ships its own data shapes; validate the array shape before use.
function actionsOf(data: unknown): ChipAction[] {
  if (
    data &&
    typeof data === "object" &&
    "actions" in data &&
    Array.isArray(data.actions)
  ) {
    return data.actions as ChipAction[];
  }
  return [];
}

function confirmOf(data: unknown): ConfirmOverwrite | null {
  if (
    data &&
    typeof data === "object" &&
    "kind" in data &&
    data.kind === "confirm_overwrite"
  ) {
    return data as ConfirmOverwrite;
  }
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`could not load image ${file.name}`));
    };
    image.src = url;
  });
}

// Downscales a lesson photo to a JPEG data URL bounded by MAX_IMAGE_EDGE. Returns
// a file part ready for sendMessage.
async function downscaleToFilePart(file: File) {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("could not get a 2d canvas context");
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    type: "file" as const,
    mediaType: "image/jpeg",
    filename: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    url: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
  };
}

// Lightweight "the tutor is thinking" indicator: three bouncing dots, shown
// while waiting for any reply that hasn't started streaming text yet.
function ThinkingDots() {
  return (
    <span className="flex items-center gap-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
    </span>
  );
}

export default function App({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const { messages, sendMessage, status } = useChat<TutorUIMessage>({
    transport,
    onData: (part) => {
      if (
        part.type === "data-progress" &&
        part.data &&
        typeof part.data === "object" &&
        "message" in part.data &&
        typeof part.data.message === "string"
      ) {
        setProgress(part.data.message);
      }
    },
  });
  const [input, setInput] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  // The progress signal is transient: clear it once the turn settles.
  useEffect(() => {
    if (!busy) setProgress(null);
  }, [busy]);

  // Keep the latest message in view — on a new turn and as a reply streams in,
  // so the child always sees that the tutor answered.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function pickImages(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files;
    if (picked && picked.length > 0) {
      setImages((current) => [...current, ...Array.from(picked)]);
    }
    event.target.value = "";
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, i) => i !== index));
  }

  // A chip or confirm option dispatches a structured command — never free text
  // the router would re-classify. add_lesson is a pure front action (open the
  // picker); everything else round-trips with the command in the request body
  // (revise_lesson enters revise; resume_overwrite answers a pending interrupt).
  // The label doubles as the user-facing bubble text.
  function dispatch(command: ActionCommand, label: string) {
    if (busy) return;
    if (command.kind === "add_lesson") {
      fileInput.current?.click();
      return;
    }
    void sendMessage({ text: label }, { body: { command } });
  }

  // Show a waiting indicator while a reply is pending and no assistant text has
  // started streaming yet (deterministic turns never stream tokens, so the dots
  // cover the whole wait). The ingestion vision step replaces it with its own
  // specific progress message.
  const lastMessage = messages.at(-1);
  const assistantTextStreaming =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => part.type === "text" && part.text.length > 0,
    );
  const showThinking = busy && !assistantTextStreaming;

  // A pending hard-gate confirmation blocks free input (brief §5.5): the child
  // must answer it via the card, not by typing.
  const awaitingConfirm =
    lastMessage?.parts.some((part) => part.type === "data-confirm") ?? false;
  const inputBlocked = busy || awaitingConfirm;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const typed = input.trim();
    if ((!typed && images.length === 0) || inputBlocked) return;

    const text = typed || DEFAULT_INGEST_TEXT;
    const files = await Promise.all(images.map(downscaleToFilePart));

    setInput("");
    setImages([]);
    void sendMessage(files.length > 0 ? { text, files } : { text });
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-4">
      <header className="flex items-center gap-3 py-6">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Tuteur IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Salut {user.displayName} — révise tes leçons, à ton rythme.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onLogout}
          aria-label="Se déconnecter"
        >
          <LogOut />
        </Button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto py-2 pr-3">
        {messages.length === 0 && <ChatEmptyState />}
        {messages.map((message, messageIndex) => {
          const role = message.role === "user" ? "user" : "assistant";
          // Chips are live only on the most recent message: once the
          // conversation has moved on, past affordances become inert (they stay
          // for history but can't be re-triggered).
          const isLast = messageIndex === messages.length - 1;
          return message.parts.map((part, index) => {
            const key = `${message.id}-${index}`;
            switch (part.type) {
              case "text":
                return (
                  <MessageBubble key={key} role={role}>
                    {part.text}
                  </MessageBubble>
                );
              case "file":
                return part.mediaType.startsWith("image/") ? (
                  <div key={key} className="flex justify-end">
                    <img
                      src={part.url}
                      alt={part.filename ?? "leçon"}
                      className="max-h-48 rounded-2xl border border-border shadow-sm"
                    />
                  </div>
                ) : null;
              case "data-actions": {
                const actions = actionsOf(part.data);
                return actions.length > 0 ? (
                  <div key={key} className="flex flex-wrap justify-start gap-2">
                    {actions.map((action, i) => (
                      <Button
                        key={`${key}-${i}`}
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy || !isLast}
                        onClick={() => dispatch(action.command, action.label)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : null;
              }
              case "data-confirm": {
                const confirm = confirmOf(part.data);
                return confirm ? (
                  <div
                    key={key}
                    className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm"
                  >
                    <p className="text-sm text-card-foreground">
                      Tu as déjà une leçon «&nbsp;{confirm.title}&nbsp;». Que veux-tu
                      faire ?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {confirm.options.map((option, i) => (
                        <Button
                          key={`${key}-${i}`}
                          type="button"
                          variant={
                            option.choice === "cancel" ? "ghost" : "secondary"
                          }
                          size="sm"
                          disabled={busy || !isLast}
                          onClick={() =>
                            dispatch(
                              { kind: "resume_overwrite", choice: option.choice },
                              option.label,
                            )
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null;
              }
              default:
                return null;
            }
          });
        })}
        {showThinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-3xl rounded-bl-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground shadow-sm">
              {progress ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {progress}
                </>
              ) : (
                <ThinkingDots />
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 py-2">
          {images.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative">
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="size-16 rounded-xl border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label="Retirer l'image"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-sm"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="flex items-center gap-2 py-4" onSubmit={submit}>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={pickImages}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-2xl"
          onClick={() => fileInput.current?.click()}
          disabled={inputBlocked}
          aria-label="Ajouter une photo de leçon"
        >
          <ImagePlus />
        </Button>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            awaitingConfirm ? "Choisis une option ci-dessus…" : "Écris un message…"
          }
          disabled={inputBlocked}
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0 rounded-2xl"
          disabled={inputBlocked}
          aria-label="Envoyer"
        >
          <Send />
        </Button>
      </form>
    </div>
  );
}
