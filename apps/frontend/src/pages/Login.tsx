import type { FormEvent } from "react";
import { useState } from "react";

import { AuthLayout, Field, FormError } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/auth";

// One login for everyone — the backend decides from the username whether this
// is the parent or a child, and the gate then routes to the right space.
export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Tuteur IA" subtitle="Connecte-toi pour commencer.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Identifiant">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          Se connecter
        </Button>
      </form>
    </AuthLayout>
  );
}
