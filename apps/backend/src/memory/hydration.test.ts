import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CONCEPT_WATERLOO,
  provisionLesson,
  provisionStudent,
  TEST_LESSON_CONCEPT_COUNT,
  TEST_LESSON_ID,
  TEST_STUDENT_ID,
} from "../../test/fixtures.js";
import { prisma } from "../db/client.js";
import { hydrateForRevision } from "./hydration.js";
import { getUnassessedConcepts } from "./repositories.js";

beforeAll(async () => {
  await provisionLesson();
});

afterEach(async () => {
  await prisma.mastery.deleteMany();
  await prisma.studentProfile.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("hydrateForRevision", () => {
  it("returns the lesson with all concepts unknown for a fresh student", async () => {
    const bundle = await hydrateForRevision(TEST_STUDENT_ID, TEST_LESSON_ID);

    expect(bundle.student.displayName).toBe("Alex");
    expect(bundle.profile).toBeNull();
    expect(bundle.lesson.contentMd.length).toBeGreaterThan(0);
    expect(bundle.concepts).toHaveLength(TEST_LESSON_CONCEPT_COUNT);
    expect(bundle.concepts.every((c) => c.mastery === null)).toBe(true);
    expect(bundle.unassessedConceptIds).toHaveLength(TEST_LESSON_CONCEPT_COUNT);
  });

  it("carries each concept's precision bar through the bundle", async () => {
    const bundle = await hydrateForRevision(TEST_STUDENT_ID, TEST_LESSON_ID);
    const waterloo = bundle.concepts.find((c) => c.id === CONCEPT_WATERLOO);

    expect(waterloo?.precisionBar).toBe("exact");
    expect(waterloo?.precisionNote).toMatch(/1815/);
  });

  it("overlays mastery on an assessed concept and shrinks the unknown set", async () => {
    await prisma.mastery.create({
      data: {
        studentId: TEST_STUDENT_ID,
        conceptId: CONCEPT_WATERLOO,
        level: "secure",
        rationale: "connaît la date exacte",
        changedBy: "test",
      },
    });

    const bundle = await hydrateForRevision(TEST_STUDENT_ID, TEST_LESSON_ID);
    const waterloo = bundle.concepts.find((c) => c.id === CONCEPT_WATERLOO);

    expect(waterloo?.mastery?.level).toBe("secure");
    expect(waterloo?.mastery?.rationale).toBe("connaît la date exacte");
    expect(bundle.unassessedConceptIds).toHaveLength(TEST_LESSON_CONCEPT_COUNT - 1);
    expect(bundle.unassessedConceptIds).not.toContain(CONCEPT_WATERLOO);
  });

  it("maps the pedagogical profile when one exists", async () => {
    await prisma.studentProfile.create({
      data: {
        studentId: TEST_STUDENT_ID,
        learningStyle: "questions courtes, une à la fois",
        changedBy: "test",
      },
    });

    const bundle = await hydrateForRevision(TEST_STUDENT_ID, TEST_LESSON_ID);

    expect(bundle.profile?.learningStyle).toBe("questions courtes, une à la fois");
    expect(bundle.profile?.motivationLevers).toBeNull();
  });

  it("throws for an unknown lesson", async () => {
    await expect(
      hydrateForRevision(TEST_STUDENT_ID, "00000000-0000-4000-8000-0000000000ff"),
    ).rejects.toThrow(/Unknown lesson/);
  });

  it("throws for an unknown student", async () => {
    await expect(
      hydrateForRevision("00000000-0000-4000-8000-0000000000ff", TEST_LESSON_ID),
    ).rejects.toThrow(/Unknown student/);
  });

  it("treats another student's lesson as unknown", async () => {
    const other = await prisma.student.create({
      data: {
        displayName: "Sam",
        username: `sam-${crypto.randomUUID()}`,
        passwordHash: "not-a-real-hash",
        gradeLevel: "6ème",
      },
    });
    try {
      await expect(
        hydrateForRevision(other.id, TEST_LESSON_ID),
      ).rejects.toThrow(/Unknown lesson/);
    } finally {
      await prisma.student.delete({ where: { id: other.id } });
    }
  });
});

describe("getUnassessedConcepts", () => {
  beforeAll(async () => {
    await provisionStudent();
  });

  it("returns every concept of the lesson for a fresh student", async () => {
    const rows = await getUnassessedConcepts(TEST_STUDENT_ID, TEST_LESSON_ID);
    expect(rows).toHaveLength(TEST_LESSON_CONCEPT_COUNT);
  });

  it("excludes a concept once it has a mastery row", async () => {
    await prisma.mastery.create({
      data: {
        studentId: TEST_STUDENT_ID,
        conceptId: CONCEPT_WATERLOO,
        level: "emerging",
        changedBy: "test",
      },
    });

    const rows = await getUnassessedConcepts(TEST_STUDENT_ID, TEST_LESSON_ID);
    expect(rows).toHaveLength(TEST_LESSON_CONCEPT_COUNT - 1);
    expect(rows.map((r) => r.id)).not.toContain(CONCEPT_WATERLOO);
  });
});
