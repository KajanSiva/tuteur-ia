import { prisma } from "../src/db/client.js";

// Stable IDs for the integration-test corpus. Each test file provisions what it
// needs through the helpers below (idempotent upserts) — the app itself starts
// from an empty database.
export const TEST_STUDENT_ID = "10000000-0000-4000-8000-000000000001";
export const TEST_LESSON_ID = "11111111-1111-4111-8111-111111111111";
export const CONCEPT_WATERLOO = "11111111-1111-4111-8111-000000000101";
export const CONCEPT_MONARCHIE = "11111111-1111-4111-8111-000000000102";
export const CONCEPT_GLORIEUSES = "11111111-1111-4111-8111-000000000103";

export const TEST_LESSON_CONCEPT_COUNT = 3;

export async function provisionStudent() {
  return prisma.student.upsert({
    where: { id: TEST_STUDENT_ID },
    create: {
      id: TEST_STUDENT_ID,
      displayName: "Alex",
      username: "alex-test",
      passwordHash: "not-a-real-hash",
      gradeLevel: "CM2",
    },
    update: {},
  });
}

// A small lesson owned by the test student, with one concept per precision bar.
export async function provisionLesson() {
  await provisionStudent();
  await prisma.lesson.upsert({
    where: { id: TEST_LESSON_ID },
    create: {
      id: TEST_LESSON_ID,
      studentId: TEST_STUDENT_ID,
      subject: "Histoire",
      title: "Du Premier Empire à la Troisième République",
      contentMd: "Napoléon est vaincu à Waterloo le 18 juin 1815.",
      metadata: { theme: 11 },
    },
    update: {},
  });
  const concepts = [
    {
      id: CONCEPT_WATERLOO,
      label: "La défaite de Waterloo",
      precisionBar: "exact" as const,
      precisionNote: "Date attendue : 18 juin 1815.",
    },
    {
      id: CONCEPT_MONARCHIE,
      label: "La monarchie constitutionnelle",
      precisionBar: "intermediate" as const,
      precisionNote: null,
    },
    {
      id: CONCEPT_GLORIEUSES,
      label: "Les Trois Glorieuses",
      precisionBar: "global" as const,
      precisionNote: null,
    },
  ];
  for (const concept of concepts) {
    await prisma.concept.upsert({
      where: { id: concept.id },
      create: { ...concept, lessonId: TEST_LESSON_ID },
      update: {},
    });
  }
}
