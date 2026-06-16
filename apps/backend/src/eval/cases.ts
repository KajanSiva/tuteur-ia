import type { MasteryLevel, PrecisionBar } from "../generated/prisma/enums.js";
import type { HydratedConcept, HydrationBundle } from "../memory/hydration.js";

// A curated golden case for the socratic eval. The fields under EvalInput are
// what the task needs to run (or stand in for) the tutor; expectedAnswer + gold
// are the ground truth the judges are scored against.
export type EvalInput = {
  lesson: { title: string; subject: string; contentMd: string };
  concept: { label: string; precisionBar: PrecisionBar; precisionNote: string | null };
  student: { displayName: string; gradeLevel: string };
  // Prior mastery the tutor is told about (null = unknown / first time).
  priorMastery: MasteryLevel | null;
  // Dialogue so far; the last turn is the student's answer the tutor reacts to.
  // Empty = the tutor opens with a first question.
  priorTurns: { role: "tutor" | "student"; text: string }[];
  // "live" runs the real socratic model; "control" feeds a planted tutor turn to
  // prove the judges catch a fault (a revealed answer or a factual error).
  kind: "live" | "control";
  controlOutput?: string;
};

export type EvalCase = EvalInput & {
  id: string;
  // The answer the concept targets — the factual judge's reference and what the
  // socratic judge checks the tutor did NOT give away.
  expectedAnswer: string;
  // Intended judge verdicts. Live cases expect a sound, non-revealing tutor;
  // controls plant exactly one fault so a judge must fire.
  gold: { factualCorrect: boolean; withheldAnswer: boolean };
};

const LOUIS_XIV =
  "Louis XIV règne sur la France de 1643 à 1715. On le surnomme le Roi-Soleil. " +
  "Il installe la cour dans le château de Versailles qu'il fait agrandir. Il exerce " +
  "une monarchie absolue de droit divin : il gouverne seul et décide de tout.";

const REVOLUTION =
  "La Révolution française commence en 1789. Le 14 juillet 1789, le peuple de Paris " +
  "prend la Bastille, une prison symbole du pouvoir du roi. En août 1789 est votée la " +
  "Déclaration des droits de l'homme et du citoyen : les hommes naissent libres et égaux " +
  "en droits. La monarchie absolue prend fin.";

const NAPOLEON =
  "Napoléon Bonaparte, général de la Révolution, est sacré empereur des Français en 1804. " +
  "Il mène de nombreuses guerres et conquiert une grande partie de l'Europe. Il est " +
  "définitivement vaincu à la bataille de Waterloo en 1815, puis envoyé en exil.";

const STUDENT = { displayName: "Camille", gradeLevel: "CM2" };

function lesson(title: string, contentMd: string) {
  return { title, subject: "Histoire", contentMd };
}

// Twelve cases: nine "live" (the real tutor, across the three precision bars) and
// three "control" (a planted fault). Controls isolate a single judge: #4 and #12
// reveal the answer (socratic must fire, factual stays clean); #8 states a false
// fact without revealing the answer (factual must fire, socratic stays clean).
export const EVAL_CASES: EvalCase[] = [
  {
    id: "louis-surnom",
    lesson: lesson("Louis XIV, le Roi-Soleil", LOUIS_XIV),
    concept: { label: "Le surnom de Louis XIV", precisionBar: "exact", precisionNote: "le Roi-Soleil" },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "live",
    expectedAnswer: "le Roi-Soleil",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "louis-versailles",
    lesson: lesson("Louis XIV, le Roi-Soleil", LOUIS_XIV),
    concept: { label: "Le château où Louis XIV installe la cour", precisionBar: "exact", precisionNote: "Versailles" },
    student: STUDENT,
    priorMastery: "developing",
    priorTurns: [
      { role: "tutor", text: "Sais-tu où Louis XIV a installé sa cour ?" },
      { role: "student", text: "À Paris je crois ?" },
    ],
    kind: "live",
    expectedAnswer: "le château de Versailles",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "louis-pouvoir",
    lesson: lesson("Louis XIV, le Roi-Soleil", LOUIS_XIV),
    concept: { label: "Le type de pouvoir de Louis XIV", precisionBar: "global", precisionNote: null },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "live",
    expectedAnswer: "une monarchie absolue : il gouverne seul",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "louis-surnom-control-revealed",
    lesson: lesson("Louis XIV, le Roi-Soleil", LOUIS_XIV),
    concept: { label: "Le surnom de Louis XIV", precisionBar: "exact", precisionNote: "le Roi-Soleil" },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "control",
    controlOutput:
      "Louis XIV était surnommé le Roi-Soleil. Maintenant, peux-tu me dire pourquoi on l'appelait ainsi ?",
    expectedAnswer: "le Roi-Soleil",
    gold: { factualCorrect: true, withheldAnswer: false },
  },
  {
    id: "revo-debut",
    lesson: lesson("La Révolution française", REVOLUTION),
    concept: { label: "L'année du début de la Révolution française", precisionBar: "exact", precisionNote: "1789" },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "live",
    expectedAnswer: "1789",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "revo-bastille",
    lesson: lesson("La Révolution française", REVOLUTION),
    concept: { label: "L'événement du 14 juillet 1789", precisionBar: "exact", precisionNote: "la prise de la Bastille" },
    student: STUDENT,
    priorMastery: "emerging",
    priorTurns: [
      { role: "tutor", text: "Que s'est-il passé le 14 juillet 1789 ?" },
      { role: "student", text: "je sais pas trop" },
    ],
    kind: "live",
    expectedAnswer: "la prise de la Bastille",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "revo-ddhc",
    lesson: lesson("La Révolution française", REVOLUTION),
    concept: { label: "L'idée principale de la Déclaration des droits de l'homme", precisionBar: "intermediate", precisionNote: null },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "live",
    expectedAnswer: "les hommes naissent libres et égaux en droits",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "revo-ddhc-control-factual",
    lesson: lesson("La Révolution française", REVOLUTION),
    concept: { label: "L'idée principale de la Déclaration des droits de l'homme", precisionBar: "intermediate", precisionNote: null },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "control",
    controlOutput:
      "La Déclaration des droits de l'homme dit que seuls les nobles ont des droits. D'après toi, pourquoi avoir écrit cela ?",
    expectedAnswer: "les hommes naissent libres et égaux en droits",
    gold: { factualCorrect: false, withheldAnswer: true },
  },
  {
    id: "napo-empereur",
    lesson: lesson("Napoléon Bonaparte", NAPOLEON),
    concept: { label: "Le titre de Napoléon en 1804", precisionBar: "exact", precisionNote: "empereur des Français" },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "live",
    expectedAnswer: "empereur des Français",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "napo-waterloo",
    lesson: lesson("Napoléon Bonaparte", NAPOLEON),
    concept: { label: "La bataille de la défaite finale de Napoléon", precisionBar: "exact", precisionNote: "Waterloo (1815)" },
    student: STUDENT,
    priorMastery: "emerging",
    priorTurns: [
      { role: "tutor", text: "Te souviens-tu de la bataille où Napoléon a été vaincu pour de bon ?" },
      { role: "student", text: "Austerlitz ?" },
    ],
    kind: "live",
    expectedAnswer: "Waterloo",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "napo-europe",
    lesson: lesson("Napoléon Bonaparte", NAPOLEON),
    concept: { label: "Ce que Napoléon a fait en Europe", precisionBar: "global", precisionNote: null },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "live",
    expectedAnswer: "il a mené beaucoup de guerres et conquis une grande partie de l'Europe",
    gold: { factualCorrect: true, withheldAnswer: true },
  },
  {
    id: "napo-waterloo-control-revealed",
    lesson: lesson("Napoléon Bonaparte", NAPOLEON),
    concept: { label: "La bataille de la défaite finale de Napoléon", precisionBar: "exact", precisionNote: "Waterloo (1815)" },
    student: STUDENT,
    priorMastery: null,
    priorTurns: [],
    kind: "control",
    controlOutput:
      "Napoléon a perdu la bataille de Waterloo en 1815, c'est bien ça ! Tu t'en souvenais ?",
    expectedAnswer: "Waterloo",
    gold: { factualCorrect: true, withheldAnswer: false },
  },
];

// Builds a synthetic hydration bundle from a case so the real socratic prompt
// (buildSocraticSystem) can run with no database — the eval's functional core.
export function caseToBundle(input: EvalInput): {
  bundle: HydrationBundle;
  concept: HydratedConcept;
} {
  const concept: HydratedConcept = {
    id: "eval-concept",
    label: input.concept.label,
    precisionBar: input.concept.precisionBar,
    precisionNote: input.concept.precisionNote,
    mastery: input.priorMastery
      ? {
          level: input.priorMastery,
          rationale: null,
          isLocked: false,
          version: 1,
          lastReviewedAt: null,
          reviewStep: 0,
        }
      : null,
  };
  const bundle: HydrationBundle = {
    student: {
      id: "eval-student",
      displayName: input.student.displayName,
      gradeLevel: input.student.gradeLevel,
      age: null,
    },
    profile: null,
    lesson: {
      id: "eval-lesson",
      title: input.lesson.title,
      subject: input.lesson.subject,
      contentMd: input.lesson.contentMd,
      metadata: null,
    },
    concepts: [concept],
    unassessedConceptIds: input.priorMastery ? [] : [concept.id],
  };
  return { bundle, concept };
}
