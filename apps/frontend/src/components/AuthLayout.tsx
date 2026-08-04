import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

// Centered card shell shared by the onboarding and login screens.
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
