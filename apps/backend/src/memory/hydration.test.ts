import { afterAll, afterEach, describe, expect, it } from "vitest";

import { prisma } from "../db/client.js";
import { hydrateForRevision } from "./hydration.js";

const STUDENT = "10000000-0000-4000-8000-000000000001";
const LESSON_11 = "11111111-1111-4111-8111-111111111111";
const CONCEPT_WATERLOO = "11111111-1111-4111-8111-000000000101";

afterEach(async () => {
  await prisma.mastery.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("hydrateForRevision", () => {
  it("returns the lesson, a null profile, and all concepts unknown for a fresh student", async () => {
    const bundle = await hydrateForRevision(STUDENT, LESSON_11);

    expect(bundle.student.displayName).toBe("Camille");
    expect(bundle.profile).toBeNull();
    expect(bundle.lesson.title).toContain("Premier Empire");
    expect(bundle.lesson.contentMd.length).toBeGreaterThan(0);
    expect(bundle.concepts).toHaveLength(9);
    expect(bundle.concepts.every((c) => c.mastery === null)).toBe(true);
    expect(bundle.unassessedConceptIds).toHaveLength(9);
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

  it("throws for an unknown lesson", async () => {
    await expect(
      hydrateForRevision(STUDENT, "00000000-0000-4000-8000-0000000000ff"),
    ).rejects.toThrow(/Unknown lesson/);
  });
});
