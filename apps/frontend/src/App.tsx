import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { TutorUIMessage } from "@tuteur/shared";
import { ImagePlus, Send, Sparkles, X } from "lucide-react";

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

export default function App() {
  const { messages, sendMessage, status } = useChat<TutorUIMessage>({
    transport,
  });
  const [input, setInput] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = status === "submitted" || status === "streaming";

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const typed = input.trim();
    if ((!typed && images.length === 0) || busy) return;

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
              default:
                return null;
            }
          });
        })}
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
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          aria-label="Ajouter une photo de leçon"
        >
          <ImagePlus />
        </Button>
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
