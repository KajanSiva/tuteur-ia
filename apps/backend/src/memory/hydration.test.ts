import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "../db/client.js";
import { hydrateForRevision } from "./hydration.js";
import { getUnassessedConcepts } from "./repositories.js";

const STUDENT = "10000000-0000-4000-8000-000000000001";
const LESSON_11 = "11111111-1111-4111-8111-111111111111";
const CONCEPT_WATERLOO = "11111111-1111-4111-8111-000000000101";

afterEach(async () => {
  await prisma.mastery.deleteMany();
  await prisma.studentProfile.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("hydrateForRevision", () => {
  it("returns the lesson with all concepts unknown for a fresh student", async () => {
    const bundle = await hydrateForRevision(STUDENT, LESSON_11);

    expect(bundle.student.displayName).toBe("Camille");
    expect(bundle.profile).toBeNull();
    expect(bundle.lesson.contentMd.length).toBeGreaterThan(0);
    expect(bundle.concepts).toHaveLength(9);
    expect(bundle.concepts.every((c) => c.mastery === null)).toBe(true);
    expect(bundle.unassessedConceptIds).toHaveLength(9);
  });

  it("carries each concept's precision bar through the bundle", async () => {
    const bundle = await hydrateForRevision(STUDENT, LESSON_11);
    const waterloo = bundle.concepts.find((c) => c.id === CONCEPT_WATERLOO);

    expect(waterloo?.precisionBar).toBe("exact");
    expect(waterloo?.precisionNote).toMatch(/1815/);
  });

  it("overlays mastery on an assessed concept and shrinks the unknown set", async () => {
    await prisma.mastery.create({
      data: {
        studentId: STUDENT,
        conceptId: CONCEPT_WATERLOO,
        level: "secure",
        rationale: "connaît la date exacte",
        changedBy: "test",
      },
    });

    const bundle = await hydrateForRevision(STUDENT, LESSON_11);
    const waterloo = bundle.concepts.find((c) => c.id === CONCEPT_WATERLOO);

    expect(waterloo?.mastery?.level).toBe("secure");
    expect(waterloo?.mastery?.rationale).toBe("connaît la date exacte");
    expect(bundle.unassessedConceptIds).toHaveLength(8);
    expect(bundle.unassessedConceptIds).not.toContain(CONCEPT_WATERLOO);
  });

  it("maps the pedagogical profile when one exists", async () => {
    await prisma.studentProfile.create({
      data: {
        studentId: STUDENT,
        learningStyle: "questions courtes, une à la fois",
        changedBy: "test",
      },
    });

    const bundle = await hydrateForRevision(STUDENT, LESSON_11);

    expect(bundle.profile?.learningStyle).toBe("questions courtes, une à la fois");
    expect(bundle.profile?.motivationLevers).toBeNull();
  });

  it("throws for an unknown lesson", async () => {
    await expect(
      hydrateForRevision(STUDENT, "00000000-0000-4000-8000-0000000000ff"),
    ).rejects.toThrow(/Unknown lesson/);
  });

  it("throws for an unknown student", async () => {
    await expect(
      hydrateForRevision("00000000-0000-4000-8000-0000000000ff", LESSON_11),
    ).rejects.toThrow(/Unknown student/);
  });
});

describe("getUnassessedConcepts", () => {
  it("returns every concept of the lesson for a fresh student", async () => {
    const rows = await getUnassessedConcepts(STUDENT, LESSON_11);
    expect(rows).toHaveLength(9);
  });

  it("excludes a concept once it has a mastery row", async () => {
    await prisma.mastery.create({
      data: {
        studentId: STUDENT,
        conceptId: CONCEPT_WATERLOO,
        level: "emerging",
        changedBy: "test",
      },
    });

    const rows = await getUnassessedConcepts(STUDENT, LESSON_11);
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.id)).not.toContain(CONCEPT_WATERLOO);
  });
});
