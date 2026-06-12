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
