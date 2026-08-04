import type { AuthState, AuthUser, ChildOverview } from "@tuteur/shared";

// Thin client over the auth API. Cookies ride along automatically (same
// origin — the dev server proxies /api). Errors are surfaced as an Error
// whose message is already user-facing French.

const ERROR_MESSAGES: Record<string, string> = {
  "username already taken": "Cet identifiant est déjà pris.",
  "unknown username or wrong password":
    "Identifiant ou mot de passe incorrect.",
  "a parent account already exists": "Un compte parent existe déjà.",
  "parent session required": "Connecte-toi avec le compte parent.",
};

const GENERIC_ERROR = "Une erreur est survenue. Réessaie.";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!response.ok) {
    let serverError: string | undefined;
    try {
      const body = (await response.json()) as { error?: string };
      serverError = body.error;
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    throw new Error(
      (serverError && ERROR_MESSAGES[serverError]) ?? GENERIC_ERROR,
    );
  }
  return (await response.json()) as T;
}

export function fetchAuthState(): Promise<AuthState> {
  return request<AuthState>("/api/auth/state");
}

export async function login(
  username: string,
  password: string,
): Promise<AuthUser> {
  const { user } = await request<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return user;
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function registerParent(input: {
  displayName: string;
  username: string;
  password: string;
}): Promise<AuthUser> {
  const { user } = await request<{ user: AuthUser }>(
    "/api/auth/register-parent",
    { method: "POST", body: JSON.stringify(input) },
  );
  return user;
}

export async function createChild(input: {
  displayName: string;
  username: string;
  password: string;
  gradeLevel: string;
  age?: number | null;
}): Promise<void> {
  await request<{ child: unknown }>("/api/children", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchChildren(): Promise<ChildOverview[]> {
  const { children } = await request<{ children: ChildOverview[] }>(
    "/api/children",
  );
  return children;
}
