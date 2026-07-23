import type { FormEvent } from "react";
import { useState } from "react";

import { AuthLayout, Field, FormError } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerParent } from "@/lib/auth";

// First-run screen: the app has no account yet, so the parent creates theirs.
// Child accounts are created right after, from the parent space.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
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
      await registerParent({ displayName, username, password });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Bienvenue !"
      subtitle="Crée le compte parent pour installer le tuteur, puis ajoute un compte pour chaque enfant."
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Ton prénom">
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoFocus
            required
          />
        </Field>
        <Field label="Identifiant">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            minLength={2}
          />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={4}
          />
        </Field>
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          Créer le compte parent
        </Button>
      </form>
    </AuthLayout>
  );
}
