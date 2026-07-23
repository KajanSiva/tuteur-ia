import type { MasteryLevel, PrecisionBar } from "../generated/prisma/enums.js";
import {
  getLessonWithConcepts,
  getMasteryForLesson,
  getStudent,
  getStudentProfile,
} from "./repositories.js";

export type ConceptMastery = {
  level: MasteryLevel;
  rationale: string | null;
  isLocked: boolean;
  version: number;
  // Spaced-repetition state (null lastReviewedAt = never stamped → due).
  lastReviewedAt: Date | null;
  reviewStep: number;
};

export type HydratedConcept = {
  id: string;
  label: string;
  precisionBar: PrecisionBar;
  precisionNote: string | null;
  // null = unknown (concept never assessed for this student).
  mastery: ConceptMastery | null;
};

export type HydrationBundle = {
  student: {
    id: string;
    displayName: string;
    gradeLevel: string;
    age: number | null;
  };
  profile: {
    learningStyle: string | null;
    motivationLevers: string | null;
    frictionToAvoid: string | null;
  } | null;
  lesson: {
    id: string;
    title: string;
    subject: string;
    contentMd: string;
    metadata: unknown;
  };
  concepts: HydratedConcept[];
  unassessedConceptIds: string[];
};

// Assembles everything the Socratic node needs for one revision turn:
// lesson content, the student's pedagogical profile, and per-concept mastery
// overlaid on the lesson's concepts (with unknowns surfaced explicitly).
export async function hydrateForRevision(
  studentId: string,
  lessonId: string,
): Promise<HydrationBundle> {
  const [student, profile, lesson, masteryRows] = await Promise.all([
    getStudent(studentId),
    getStudentProfile(studentId),
    getLessonWithConcepts(lessonId),
    getMasteryForLesson(studentId, lessonId),
  ]);

  if (!student) {
    throw new Error(`Unknown student: ${studentId}`);
  }
  // A lesson belonging to another student is treated as unknown, so a stray
  // lessonId can never surface a sibling's lesson content.
  if (!lesson || lesson.studentId !== studentId) {
    throw new Error(`Unknown lesson: ${lessonId}`);
  }

  const masteryByConcept = new Map(masteryRows.map((m) => [m.conceptId, m]));

  const concepts: HydratedConcept[] = lesson.concepts.map((concept) => {
    const mastery = masteryByConcept.get(concept.id);
    return {
      id: concept.id,
      label: concept.label,
      precisionBar: concept.precisionBar,
      precisionNote: concept.precisionNote,
      mastery: mastery
        ? {
            level: mastery.level,
            rationale: mastery.rationale,
            isLocked: mastery.isLocked,
            version: mastery.version,
            lastReviewedAt: mastery.lastReviewedAt,
            reviewStep: mastery.reviewStep,
          }
        : null,
    };
  });

  return {
    student: {
      id: student.id,
      displayName: student.displayName,
      gradeLevel: student.gradeLevel,
      age: student.age,
    },
    profile: profile
      ? {
          learningStyle: profile.learningStyle,
          motivationLevers: profile.motivationLevers,
          frictionToAvoid: profile.frictionToAvoid,
        }
      : null,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject,
      contentMd: lesson.contentMd,
      metadata: lesson.metadata,
    },
    concepts,
    unassessedConceptIds: concepts
      .filter((concept) => concept.mastery === null)
      .map((concept) => concept.id),
  };
}
