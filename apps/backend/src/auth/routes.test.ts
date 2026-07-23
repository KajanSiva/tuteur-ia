import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ChildOverview } from "@tuteur/shared";

import { prisma } from "../db/client.js";
import { authRoutes } from "./routes.js";

const SECRET = "integration-test-secret";

// Rows created through the API are tracked and removed after each test so the
// suite leaves the shared test database as it found it.
const createdParentIds: string[] = [];
const createdStudentIds: string[] = [];

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(cookie);
  await app.register(authRoutes, { secret: SECRET });
  await app.ready();
});

afterEach(async () => {
  await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
  await prisma.parent.deleteMany({ where: { id: { in: createdParentIds } } });
  createdStudentIds.length = 0;
  createdParentIds.length = 0;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

function sessionCookieOf(response: {
  cookies: { name: string; value: string }[];
}): string {
  const session = response.cookies.find((c) => c.name === "tuteur_session");
  if (!session) throw new Error("expected a session cookie");
  return session.value;
}

async function registerParent(username = "papa") {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register-parent",
    payload: { displayName: "Papa", username, password: "secret-parent" },
  });
  if (response.statusCode === 200) {
    const { user } = response.json() as { user: { id: string } };
    createdParentIds.push(user.id);
  }
  return response;
}

async function createChild(
  parentCookie: string,
  over: Record<string, unknown> = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/children",
    cookies: { tuteur_session: parentCookie },
    payload: {
      displayName: "Zoé",
      username: "zoe",
      password: "abeille",
      gradeLevel: "CE2",
      ...over,
    },
  });
  if (response.statusCode === 200) {
    const { child } = response.json() as { child: { id: string } };
    createdStudentIds.push(child.id);
  }
  return response;
}

describe("onboarding and login", () => {
  it("starts uninitialized, then initialized once the parent registers", async () => {
    const before = await app.inject({ method: "GET", url: "/api/auth/state" });
    expect(before.json()).toEqual({ initialized: false, user: null });

    const registered = await registerParent();
    expect(registered.statusCode).toBe(200);
    const cookieValue = sessionCookieOf(registered);

    const after = await app.inject({
      method: "GET",
      url: "/api/auth/state",
      cookies: { tuteur_session: cookieValue },
    });
    const state = after.json() as {
      initialized: boolean;
      user: { role: string; displayName: string };
    };
    expect(state.initialized).toBe(true);
    expect(state.user).toMatchObject({ role: "parent", displayName: "Papa" });
  });

  it("refuses a second parent registration", async () => {
    await registerParent();
    const second = await registerParent("maman");
    expect(second.statusCode).toBe(409);
  });

  it("logs the parent in with the right password and refuses a wrong one", async () => {
    await registerParent();

    const ok = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "papa", password: "secret-parent" },
    });
    expect(ok.statusCode).toBe(200);
    expect(sessionCookieOf(ok)).toBeTruthy();

    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "papa", password: "wrong" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("logs a child in and reports a child session with the grade level", async () => {
    const parentCookie = sessionCookieOf(await registerParent());
    await createChild(parentCookie);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "zoe", password: "abeille" },
    });
    expect(login.statusCode).toBe(200);

    const state = await app.inject({
      method: "GET",
      url: "/api/auth/state",
      cookies: { tuteur_session: sessionCookieOf(login) },
    });
    expect((state.json() as { user: unknown }).user).toMatchObject({
      role: "child",
      displayName: "Zoé",
      gradeLevel: "CE2",
    });
  });

  it("logout clears the session", async () => {
    const parentCookie = sessionCookieOf(await registerParent());
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { tuteur_session: parentCookie },
    });
    const cleared = logout.cookies.find((c) => c.name === "tuteur_session");
    expect(cleared?.value).toBe("");
  });
});

describe("child account management", () => {
  it("requires a parent session to create or list children", async () => {
    const anonymousCreate = await app.inject({
      method: "POST",
      url: "/api/children",
      payload: {
        displayName: "Zoé",
        username: "zoe",
        password: "abeille",
        gradeLevel: "CE2",
      },
    });
    expect(anonymousCreate.statusCode).toBe(401);

    const anonymousList = await app.inject({
      method: "GET",
      url: "/api/children",
    });
    expect(anonymousList.statusCode).toBe(401);
  });

  it("a child session cannot create children", async () => {
    const parentCookie = sessionCookieOf(await registerParent());
    await createChild(parentCookie);
    const childLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "zoe", password: "abeille" },
    });

    const attempt = await app.inject({
      method: "POST",
      url: "/api/children",
      cookies: { tuteur_session: sessionCookieOf(childLogin) },
      payload: {
        displayName: "X",
        username: "x-child",
        password: "abcd",
        gradeLevel: "6ème",
      },
    });
    expect(attempt.statusCode).toBe(401);
  });

  it("refuses a username already taken, including the parent's", async () => {
    const parentCookie = sessionCookieOf(await registerParent());
    await createChild(parentCookie);

    const duplicateChild = await createChild(parentCookie, {
      username: "ZOE",
    });
    expect(duplicateChild.statusCode).toBe(409);

    const parentClash = await createChild(parentCookie, { username: "papa" });
    expect(parentClash.statusCode).toBe(409);
  });

  it("rolls up per-lesson mastery counts for the parent view", async () => {
    const parentCookie = sessionCookieOf(await registerParent());
    const createResponse = await createChild(parentCookie);
    const { child } = createResponse.json() as { child: { id: string } };

    const lesson = await prisma.lesson.create({
      data: {
        studentId: child.id,
        subject: "Sciences",
        title: "Le cycle de l'eau",
        contentMd: "L'eau s'évapore, se condense, précipite.",
        concepts: {
          create: [
            { label: "Évaporation", precisionBar: "intermediate" },
            { label: "Condensation", precisionBar: "intermediate" },
            { label: "Précipitations", precisionBar: "global" },
          ],
        },
      },
      include: { concepts: { orderBy: { label: "asc" } } },
    });
    const [condensation, evaporation] = lesson.concepts;
    await prisma.mastery.createMany({
      data: [
        {
          studentId: child.id,
          conceptId: evaporation!.id,
          level: "secure",
          changedBy: "test",
        },
        {
          studentId: child.id,
          conceptId: condensation!.id,
          level: "developing",
          changedBy: "test",
        },
      ],
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/children",
      cookies: { tuteur_session: parentCookie },
    });
    expect(list.statusCode).toBe(200);
    const { children } = list.json() as { children: ChildOverview[] };
    const zoe = children.find((c) => c.id === child.id);
    expect(zoe).toBeDefined();
    expect(zoe?.gradeLevel).toBe("CE2");
    expect(zoe?.lessons).toEqual([
      {
        id: lesson.id,
        title: "Le cycle de l'eau",
        subject: "Sciences",
        conceptCount: 3,
        secureCount: 1,
        inProgressCount: 1,
      },
    ]);
  });
});
