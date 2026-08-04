import { prisma } from "../db/client.js";

export function getStudent(studentId: string) {
  return prisma.student.findUnique({ where: { id: studentId } });
}

export function getStudentProfile(studentId: string) {
  return prisma.studentProfile.findUnique({ where: { studentId } });
}

export function getLessonWithConcepts(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { concepts: { orderBy: { id: "asc" } } },
  });
}

// Lightweight lesson list for the deterministic resolver: title + theme + the
// concept labels (so a lesson can be matched by its subject, not only its title).
// Scoped to the student — each child only ever resolves against their own corpus.
export function getLessonsForResolution(studentId: string) {
  return prisma.lesson.findMany({
    where: { studentId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      metadata: true,
      concepts: { select: { label: true }, orderBy: { id: "asc" } },
    },
  });
}

export function getMasteryForLesson(studentId: string, lessonId: string) {
  return prisma.mastery.findMany({
    where: { studentId, concept: { lessonId } },
  });
}

// Concepts of a lesson never assessed for this student. "Unknown" is the
// absence of a current mastery row, retrieved as a relational anti-join.
export function getUnassessedConcepts(studentId: string, lessonId: string) {
  return prisma.concept.findMany({
    where: { lessonId, masteries: { none: { studentId } } },
    orderBy: { id: "asc" },
  });
}
