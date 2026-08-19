import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthState, AuthUser, ChildOverview } from "@tuteur/shared";
import { z } from "zod";

import { prisma } from "../db/client.js";
import {
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
} from "./cookie-options.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { signSession, type SessionClaims, verifySession } from "./tokens.js";

export const SESSION_COOKIE = "tuteur_session";

// Reads and verifies the session cookie. Null for a missing, malformed,
// tampered or expired token — the caller decides whether that is a 401.
export function sessionOf(
  request: FastifyRequest,
  secret: string,
): SessionClaims | null {
  const token = request.cookies?.[SESSION_COOKIE];
  return token ? verifySession(token, secret, new Date()) : null;
}

function setSessionCookie(
  reply: FastifyReply,
  claims: Omit<SessionClaims, "exp">,
  secret: string,
): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession({ ...claims, exp }, secret);
  void reply.setCookie(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(process.env.NODE_ENV),
  );
}

// Usernames are compared and stored lowercase so "Zoe" and "zoe" cannot
// coexist; they must be unique across parents AND students (one shared login
// form decides the role from where the username is found).
function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

async function usernameTaken(username: string): Promise<boolean> {
  const [parent, student] = await Promise.all([
    prisma.parent.findUnique({ where: { username } }),
    prisma.student.findUnique({ where: { username } }),
  ]);
  return parent !== null || student !== null;
}

const CredentialsSchema = z.object({
  username: z.string().trim().min(2),
  password: z.string().min(4),
});

const RegisterParentSchema = CredentialsSchema.extend({
  displayName: z.string().trim().min(1),
});

const CreateChildSchema = CredentialsSchema.extend({
  displayName: z.string().trim().min(1),
  gradeLevel: z.string().trim().min(1),
  age: z.number().int().min(3).max(20).nullable().optional(),
});

// The family-admin mastery rollup: every child with, per lesson, how many
// concepts are secure vs in progress (the rest have never been assessed).
async function childrenOverview(): Promise<ChildOverview[]> {
  const students = await prisma.student.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      lessons: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          subject: true,
          concepts: { select: { id: true } },
        },
      },
      masteries: { select: { conceptId: true, level: true } },
    },
  });
  return students.map((student) => {
    const levelByConcept = new Map(
      student.masteries.map((m) => [m.conceptId, m.level]),
    );
    return {
      id: student.id,
      displayName: student.displayName,
      username: student.username,
      gradeLevel: student.gradeLevel,
      age: student.age,
      lessons: student.lessons.map((lesson) => {
        let secureCount = 0;
        let inProgressCount = 0;
        for (const concept of lesson.concepts) {
          const level = levelByConcept.get(concept.id);
          if (level === "secure") secureCount += 1;
          else if (level !== undefined) inProgressCount += 1;
        }
        return {
          id: lesson.id,
          title: lesson.title,
          subject: lesson.subject,
          conceptCount: lesson.concepts.length,
          secureCount,
          inProgressCount,
        };
      }),
    };
  });
}

export type AuthRoutesOptions = { secret: string };

export async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const { secret } = options;

  // 401-guard for parent-only routes; sends the reply itself on failure.
  async function requireParent(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SessionClaims | null> {
    const claims = sessionOf(request, secret);
    if (!claims || claims.role !== "parent") {
      await reply.code(401).send({ error: "parent session required" });
      return null;
    }
    const parent = await prisma.parent.findUnique({
      where: { id: claims.sub },
    });
    if (!parent) {
      await reply.code(401).send({ error: "parent session required" });
      return null;
    }
    return claims;
  }

  app.get("/api/auth/state", async (request): Promise<AuthState> => {
    const initialized = (await prisma.parent.count()) > 0;
    const claims = sessionOf(request, secret);
    let user: AuthUser | null = null;
    if (claims?.role === "parent") {
      const parent = await prisma.parent.findUnique({
        where: { id: claims.sub },
      });
      if (parent) {
        user = { role: "parent", id: parent.id, displayName: parent.displayName };
      }
    } else if (claims?.role === "child") {
      const student = await prisma.student.findUnique({
        where: { id: claims.sub },
      });
      if (student) {
        user = {
          role: "child",
          id: student.id,
          displayName: student.displayName,
          gradeLevel: student.gradeLevel,
        };
      }
    }
    return { initialized, user };
  });

  // Onboarding: creates THE parent account. Refused once one exists — later
  // family members log in with the shared parent account for now.
  app.post("/api/auth/register-parent", async (request, reply) => {
    const parsed = RegisterParentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid registration payload" });
    }
    if ((await prisma.parent.count()) > 0) {
      return reply.code(409).send({ error: "a parent account already exists" });
    }
    const username = normalizeUsername(parsed.data.username);
    if (await usernameTaken(username)) {
      return reply.code(409).send({ error: "username already taken" });
    }
    const parent = await prisma.parent.create({
      data: {
        displayName: parsed.data.displayName,
        username,
        passwordHash: hashPassword(parsed.data.password),
      },
    });
    setSessionCookie(reply, { role: "parent", sub: parent.id }, secret);
    const user: AuthUser = {
      role: "parent",
      id: parent.id,
      displayName: parent.displayName,
    };
    return { user };
  });

  // One login form for everyone: the username decides whether this is the
  // parent or a child.
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = CredentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid login payload" });
    }
    const username = normalizeUsername(parsed.data.username);

    const parent = await prisma.parent.findUnique({ where: { username } });
    if (parent && verifyPassword(parsed.data.password, parent.passwordHash)) {
      setSessionCookie(reply, { role: "parent", sub: parent.id }, secret);
      const user: AuthUser = {
        role: "parent",
        id: parent.id,
        displayName: parent.displayName,
      };
      return { user };
    }

    const student = await prisma.student.findUnique({ where: { username } });
    if (student && verifyPassword(parsed.data.password, student.passwordHash)) {
      setSessionCookie(reply, { role: "child", sub: student.id }, secret);
      const user: AuthUser = {
        role: "child",
        id: student.id,
        displayName: student.displayName,
        gradeLevel: student.gradeLevel,
      };
      return { user };
    }

    return reply.code(401).send({ error: "unknown username or wrong password" });
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    void reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.post("/api/children", async (request, reply) => {
    if (!(await requireParent(request, reply))) {
      return;
    }
    const parsed = CreateChildSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid child payload" });
    }
    const username = normalizeUsername(parsed.data.username);
    if (await usernameTaken(username)) {
      return reply.code(409).send({ error: "username already taken" });
    }
    const student = await prisma.student.create({
      data: {
        displayName: parsed.data.displayName,
        username,
        passwordHash: hashPassword(parsed.data.password),
        gradeLevel: parsed.data.gradeLevel,
        age: parsed.data.age ?? null,
      },
    });
    return {
      child: {
        id: student.id,
        displayName: student.displayName,
        username: student.username,
        gradeLevel: student.gradeLevel,
        age: student.age,
      },
    };
  });

  app.get("/api/children", async (request, reply) => {
    if (!(await requireParent(request, reply))) {
      return;
    }
    return { children: await childrenOverview() };
  });
}
