import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import type { AuthUser, ChildOverview, LessonOverview } from "@tuteur/shared";
import { LogOut, Plus, Sparkles } from "lucide-react";

import { Field, FormError } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createChild, fetchChildren } from "@/lib/auth";

const GRADE_LEVELS = [
  "CP",
  "CE1",
  "CE2",
  "CM1",
  "CM2",
  "6ème",
  "5ème",
  "4ème",
  "3ème",
];

// Stacked mastery bar: secure, in progress, and the untouched remainder.
function MasteryBar({ lesson }: { lesson: LessonOverview }) {
  if (lesson.conceptCount === 0) return null;
  const secure = (lesson.secureCount / lesson.conceptCount) * 100;
  const inProgress = (lesson.inProgressCount / lesson.conceptCount) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className="bg-primary" style={{ width: `${secure}%` }} />
      <div className="bg-accent" style={{ width: `${inProgress}%` }} />
    </div>
  );
}

function LessonRow({ lesson }: { lesson: LessonOverview }) {
  const unseen = lesson.conceptCount - lesson.secureCount - lesson.inProgressCount;
  return (
    <li className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{lesson.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {lesson.subject}
        </span>
      </div>
      <MasteryBar lesson={lesson} />
      <p className="text-xs text-muted-foreground">
        {lesson.secureCount} maîtrisé{lesson.secureCount > 1 ? "s" : ""} ·{" "}
        {lesson.inProgressCount} en cours · {unseen} pas encore vu
        {unseen > 1 ? "s" : ""}
      </p>
    </li>
  );
}

function ChildCard({ child }: { child: ChildOverview }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">
          {child.displayName}
        </h2>
        <span className="text-sm text-muted-foreground">
          {child.gradeLevel} · identifiant « {child.username} »
        </span>
      </div>
      {child.lessons.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Aucune leçon pour l'instant — depuis son compte, {child.displayName}{" "}
          peut envoyer une photo d'une leçon pour commencer.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {child.lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AddChildForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [gradeLevel, setGradeLevel] = useState("CE2");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Plus /> Ajouter un enfant
      </Button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createChild({ displayName, username, password, gradeLevel });
      setDisplayName("");
      setUsername("");
      setPassword("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm"
      onSubmit={submit}
    >
      <h2 className="font-display text-lg font-semibold">Nouvel enfant</h2>
      <Field label="Prénom">
        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoFocus
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Identifiant">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            required
            minLength={2}
          />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            required
            minLength={4}
          />
        </Field>
      </div>
      <Field label="Classe">
        <Select
          value={gradeLevel}
          onChange={(event) => setGradeLevel(event.target.value)}
        >
          {GRADE_LEVELS.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </Select>
      </Field>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Créer le compte
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}

// The parent space: every child with a per-lesson mastery rollup, plus the
// child-account creation form. Read-only otherwise — the tutoring itself
// happens in each child's own session.
export function ParentDashboard({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const [children, setChildren] = useState<ChildOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setChildren(await fetchChildren());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 pb-8">
      <header className="flex items-center gap-3 py-6">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Tuteur IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Espace parent — {user.displayName}
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

      <FormError message={error} />
      {children === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <>
          {children.length === 0 && (
            <p className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              Commence par créer un compte pour chaque enfant. Chacun aura son
              identifiant et son mot de passe pour réviser.
            </p>
          )}
          {children.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
          <AddChildForm onCreated={() => void refresh()} />
        </>
      )}
    </div>
  );
}
