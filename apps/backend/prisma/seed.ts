import "dotenv/config";
import { readFileSync } from "node:fs";

import { prisma } from "../src/db/client.js";

type PrecisionBar = "exact" | "intermediate" | "global";

type ConceptSeed = {
  id: string;
  label: string;
  precisionBar: PrecisionBar;
  precisionNote: string | null;
};

type LessonSeed = {
  id: string;
  title: string;
  theme: number;
  file: string;
  concepts: ConceptSeed[];
};

function readLesson(file: string): string {
  return readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8");
}

const STUDENT = {
  id: "10000000-0000-4000-8000-000000000001",
  displayName: "Camille",
  gradeLevel: "CM2",
};

const LESSONS: LessonSeed[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Du Premier Empire à la Troisième République",
    theme: 11,
    file: "theme-11-premier-empire-troisieme-republique.md",
    concepts: [
      {
        id: "11111111-1111-4111-8111-000000000101",
        label: "La chute de Napoléon Ier et la défaite de Waterloo",
        precisionBar: "exact",
        precisionNote: "Date attendue : 18 juin 1815.",
      },
      {
        id: "11111111-1111-4111-8111-000000000102",
        label: "La monarchie constitutionnelle (vs monarchie absolue)",
        precisionBar: "intermediate",
        precisionNote:
          "Les citoyens les plus riches élisent des députés qui votent les lois et le budget.",
      },
      {
        id: "11111111-1111-4111-8111-000000000103",
        label: "Les rois après l'Empire : Louis XVIII, Charles X, Louis-Philippe",
        precisionBar: "exact",
        precisionNote: "Connaître l'ordre et les règnes (1814–1848).",
      },
      {
        id: "11111111-1111-4111-8111-000000000104",
        label: "Les Trois Glorieuses",
        precisionBar: "exact",
        precisionNote: "27–29 juillet 1830.",
      },
      {
        id: "11111111-1111-4111-8111-000000000105",
        label: "Louis Napoléon Bonaparte, Napoléon III et le Second Empire",
        precisionBar: "intermediate",
        precisionNote:
          "Élu président de la IIe République, il proclame le Second Empire (1852).",
      },
      {
        id: "11111111-1111-4111-8111-000000000106",
        label: "La modernisation sous Napoléon III (Haussmann, transports)",
        precisionBar: "global",
        precisionNote: null,
      },
      {
        id: "11111111-1111-4111-8111-000000000107",
        label: "La défaite de Sedan et la fin du Second Empire",
        precisionBar: "exact",
        precisionNote: "2 septembre 1870.",
      },
      {
        id: "11111111-1111-4111-8111-000000000108",
        label: "La proclamation de la Troisième République",
        precisionBar: "exact",
        precisionNote: "Septembre 1870 ; régime en vigueur de 1870 à 1940.",
      },
      {
        id: "11111111-1111-4111-8111-000000000109",
        label: "Les symboles de la République",
        precisionBar: "intermediate",
        precisionNote: "Bonnet phrygien, drapeau tricolore, corne d'abondance…",
      },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "L'école primaire gratuite, laïque et obligatoire",
    theme: 12,
    file: "theme-12-ecole-gratuite-laique-obligatoire.md",
    concepts: [
      {
        id: "22222222-2222-4222-8222-000000000201",
        label: "Le travail des enfants au XIXe siècle",
        precisionBar: "global",
        precisionNote: "Avant les lois scolaires : champs, mine, atelier, usine.",
      },
      {
        id: "22222222-2222-4222-8222-000000000202",
        label: "Les conditions de travail des enfants (témoignage de Villermé)",
        precisionBar: "intermediate",
        precisionNote: null,
      },
      {
        id: "22222222-2222-4222-8222-000000000203",
        label: "La loi de 1881 : l'école gratuite (Jules Ferry)",
        precisionBar: "exact",
        precisionNote: "1881 ; Jules Ferry, ministre de l'Instruction.",
      },
      {
        id: "22222222-2222-4222-8222-000000000204",
        label: "La loi de 1882 : l'école laïque",
        precisionBar: "exact",
        precisionNote:
          "1882 ; le catéchisme remplacé par l'instruction civique et morale.",
      },
      {
        id: "22222222-2222-4222-8222-000000000205",
        label: "La loi de 1882 : l'école obligatoire (6 à 13 ans)",
        precisionBar: "exact",
        precisionNote: "Obligatoire pour les filles et garçons de 6 à 13 ans.",
      },
      {
        id: "22222222-2222-4222-8222-000000000206",
        label: "La laïcité",
        precisionBar: "intermediate",
        precisionNote: "Laïque = indépendant des religions.",
      },
      {
        id: "22222222-2222-4222-8222-000000000207",
        label: "Les conséquences : recul du travail des enfants et alphabétisation",
        precisionBar: "global",
        precisionNote:
          "Au début du XXe siècle, la majorité des Français savent lire et écrire.",
      },
      {
        id: "22222222-2222-4222-8222-000000000208",
        label: "L'école à cette époque (classes séparées, matières, discipline)",
        precisionBar: "global",
        precisionNote: null,
      },
    ],
  },
];

async function main() {
  await prisma.student.upsert({
    where: { id: STUDENT.id },
    create: STUDENT,
    update: { displayName: STUDENT.displayName, gradeLevel: STUDENT.gradeLevel },
  });

  for (const lesson of LESSONS) {
    await prisma.lesson.upsert({
      where: { id: lesson.id },
      create: {
        id: lesson.id,
        subject: "Histoire",
        title: lesson.title,
        contentMd: readLesson(lesson.file),
        metadata: { theme: lesson.theme },
      },
      update: {
        title: lesson.title,
        contentMd: readLesson(lesson.file),
        metadata: { theme: lesson.theme },
      },
    });

    // Reset the concept set to match the fixture exactly on every run.
    await prisma.concept.deleteMany({ where: { lessonId: lesson.id } });
    await prisma.concept.createMany({
      data: lesson.concepts.map((c) => ({ ...c, lessonId: lesson.id })),
    });
  }

  const [students, lessons, concepts] = await Promise.all([
    prisma.student.count(),
    prisma.lesson.count(),
    prisma.concept.count(),
  ]);
  console.log(
    `Seed done — students: ${students}, lessons: ${lessons}, concepts: ${concepts}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
