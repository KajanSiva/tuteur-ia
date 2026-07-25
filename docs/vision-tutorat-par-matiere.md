# Vision — un tutorat par matière (primaire & collège)

Document de travail pour le brainstorm. Aucune décision ici n'est actée : la
section finale liste ce qui doit être tranché. Périmètre visé à court terme :
CE2 et 6ème ; projection : toute la primaire et le collège.

## 1. Le problème

Le flow actuel a une seule manière de travailler un concept : le dialogue
socratique sur le contenu d'une leçon. C'est adapté aux savoirs déclaratifs
(histoire, géographie, sciences, EMC, « Questionner le monde ») mais pas au
reste de la scolarité :

- en **maths**, vérifier une compréhension = faire faire des exercices, pas
  discuter d'un texte ; et une bonne partie du travail est de l'automatisme
  (tables, opérations posées) qui se travaille par répétition rapide ;
- en **français**, la grammaire/conjugaison se vérifie en exercices,
  l'orthographe en dictée, la rédaction demande un retour critérié — trois
  modalités différentes dans la même matière ;
- en **physique-chimie** (collège), le cours s'apprend mais la maîtrise se
  prouve en appliquant une méthode à un exercice.

Un seul mode d'évaluation ⇒ soit on n'évalue pas vraiment (l'enfant « explique »
la division sans jamais en poser une), soit on exclut des matières entières.

## 2. L'idée pivot : découpler le savoir de l'activité

Ce qui est déjà juste dans l'app et ne doit pas bouger : la mémoire est un
ensemble de **concepts** par élève, avec un niveau de maîtrise, un historique
append-only et une politique d'écriture prudente. Ce modèle est agnostique à la
matière.

Ce qui doit devenir pluriel : **l'activité** par laquelle on travaille et on
évalue un concept. La vision tient en une phrase :

> Un concept a un *type de savoir* ; une séance choisit, pour chaque concept,
> une *activité* adaptée à ce type ; toutes les activités parlent à la mémoire
> par le même contrat (un signal de maîtrise standardisé).

### Types de savoir

Renseigné à l'ingestion (le parseur le fait déjà pour la barre de précision) :

| Type | Exemples | Se travaille par |
|---|---|---|
| **Fait** | dates, capitales, vocabulaire, définitions | quiz, rappel, socratique |
| **Notion** | la laïcité, la photosynthèse, la monarchie constitutionnelle | dialogue socratique, reformulation |
| **Méthode** | poser une division, accorder un participe, équilibrer un schéma | exercices générés, avec variation |
| **Automatisme** | tables, conjugaisons, calcul mental | drill rapide + répétition espacée serrée |
| **Production** | rédaction, expression écrite | consigne + retour critérié |

### Catalogue d'activités (cible, incrémental)

| Activité | Savoirs | Matières typiques | Vérification |
|---|---|---|---|
| **Dialogue socratique** (existant) | notion, fait | histoire-géo, sciences, EMC | juge LLM (existant) |
| **Quiz / questions de connaissance** | fait, automatisme | toutes | fermée (exacte ou juge cheap) |
| **Exercice vérifiable** | méthode, automatisme | maths, physique, grammaire/conjugaison | déterministe quand c'est du calcul, juge LLM sinon |
| **Dictée** | automatisme (orthographe) | français primaire | diff + classification des erreurs |
| **Expression écrite** | production | français | retour critérié (grille), pas de score binaire |
| **Récitation** | fait, automatisme | poésies, tables, verbes irréguliers | rappel guidé |
| *(plus tard)* **Oral / audio** | langues vivantes | anglais | hors périmètre proche |

Couverture CE2 : socratique (Questionner le monde) + quiz + exercices (maths,
grammaire) + dictée + récitation (poésies, tables).
Couverture 6ème : socratique (histoire-géo, sciences & techno, EMC) + quiz +
exercices (maths, grammaire) + expression écrite courte.

## 3. La séance : une playlist d'activités

La séance reste orchestrée par du code déterministe (rien ne change dans la
philosophie) :

1. **Sélection des concepts** — comme aujourd'hui : gaps-first + répétition
   espacée, mais *inter-leçons* à terme (le « menu du jour »).
2. **Choix d'activité par concept** — déterministe : type de savoir +
   historique (varier les modalités, re-tester une méthode par un exercice
   différent) + profil de l'élève.
3. **Exécution** — chaque activité est un module isolé qui rend le même
   signal de maîtrise ; la boucle avance concept par concept comme aujourd'hui.
4. **Distillation** — inchangée : applier déterministe, silence ≠
   contradiction, historique, trace de séance (enrichie du type d'activité).

## 4. Autonomie de l'enfant, suivi du parent

**L'enfant fait tout seul.** Il ouvre l'app, le tuteur lui propose un menu
(« aujourd'hui : 2 exercices de maths, 3 questions d'histoire — ~10 min »), il
peut aussi demander une leçon précise ou photographier une nouvelle leçon.
Aucune étape ne requiert le parent. Le système est sûr par construction : il ne
donne jamais la réponse, et le contenu vient des leçons de l'école de l'enfant.

**Le parent suit sans être dans la boucle.** L'espace parent montre par enfant :
la progression par matière et par concept (avec tendance), l'assiduité (séances,
durée), les points de blocage détectés (concepts qui résistent après plusieurs
séances), et à terme un résumé hebdomadaire. Optionnel (à trancher) : le parent
oriente (« cette semaine, priorité aux tables »), valide les leçons ingérées,
consulte le détail des séances.

**Calibrage par âge.**
- CE2 : séances courtes (5-10 min), consignes minimales, audio utile (TTS pour
  les dictées et les consignes), UI simple, encouragements très présents,
  gamification légère (série de jours, étoiles par concept maîtrisé).
- 6ème : séances 15-20 min, plusieurs matières, et le vrai besoin du collège :
  **préparer un contrôle** (« contrôle de maths jeudi sur les fractions » → un
  plan de révision étalé sur les jours restants).

## 5. Architecture cible : le contrat d'activité

Le pivot technique est petit mais structurant : extraire de `revise.ts` la
notion générique de « travailler un concept » et la mettre derrière un contrat.

```
ActivityModule = {
  type: "socratic" | "quiz" | "exercise" | "dictation" | ...
  // Peut-elle travailler ce concept ? (type de savoir, matière, âge)
  accepts(concept, student): boolean
  // Sous-graphe : dialogue en un ou plusieurs tours, jusqu'à résolution
  nodes / edges (LangGraph)
  // Sortie OBLIGATOIREMENT identique pour toutes les activités :
  → MasterySignal { status, level, rationale }   // le format actuel
}
```

- **La mémoire ne change pas.** L'applier, les tables `mastery*`, la politique
  d'écriture : intacts. C'est ce qui rend l'itération sur les activités sans
  risque — une activité ratée ne peut pas corrompre la mémoire, au pire elle
  produit un signal pauvre.
- **La boucle de séance devient générique.** Le couple queue/cursor/turns
  actuel pilote déjà la boucle ; il devient paramétré par l'activité courante
  au lieu de supposer « socratique ».
- **Un registre d'activités** (du code, pas de la config) déclare les modules
  disponibles ; le sélecteur d'activité y puise. Ajouter une activité = un
  dossier avec ses nœuds, ses prompts, ses tests unitaires et ses cas d'eval —
  sans toucher au reste.
- **Chaque activité a son harnais d'eval** (cas dorés + juges), comme le
  socratique aujourd'hui. C'est la condition pour itérer vite sans régresser.
- **Schéma** : `Concept.knowledgeKind` (fait/notion/méthode/automatisme/
  production), rempli à l'ingestion ; les entrées de `session_trace` portent le
  type d'activité et son détail (l'énoncé posé, la réponse donnée).

### Fiabilité des corrections (le point dur des maths)

Une correction fausse détruit la confiance (celle de l'enfant ET celle du
parent). Position proposée : **hybride**.
- Automatismes (tables, opérations, conversions) : énoncés générés par
  *templates paramétrés déterministes* → la correction est un calcul, fiabilité
  totale, zéro LLM dans la boucle de vérification.
- Petits problèmes et exercices d'application : énoncé généré par LLM depuis la
  leçon, mais **vérifié par résolution indépendante** (le vérificateur résout
  de son côté, en tirant parti du calcul déterministe quand c'est possible)
  avant d'être posé ; correction par comparaison + explication socratique en
  cas d'erreur.

## 6. Chemin d'adaptation depuis l'app actuelle

Chaque étape est livrable et utile seule ; l'ordre minimise le risque.

1. **Le contrat d'activité (pure architecture).** Refactorer le flow socratique
   actuel en premier module du registre ; boucle de séance générique ;
   `knowledgeKind` sur les concepts ; `session_trace` enrichie. Aucune
   fonctionnalité nouvelle — c'est le pivot modulaire, tout le reste en découle.
2. **Le quiz.** Deuxième activité, la plus simple (questions fermées générées
   du concept, correction quasi déterministe), valable dans toutes les
   matières. Elle valide le contrat avec un risque minimal, et améliore déjà
   les révisions de « faits » en histoire/sciences.
3. **Les exercices vérifiables, maths d'abord.** Templates déterministes pour
   les automatismes, génération vérifiée pour les problèmes. UI d'entrée
   adaptée (clavier numérique, brouillon). C'est l'étape qui ouvre vraiment les
   maths CE2 et 6ème.
4. **Le menu du jour.** Sélecteur inter-leçons et inter-matières (SRS global),
   proposition proactive à l'ouverture. À ce stade, l'enfant a une vraie
   routine autonome.
5. **Le français au-delà de la grammaire.** Dictée (nécessite TTS) puis
   expression écrite courte (retour critérié). 
6. **Le collège en propre.** Préparation de contrôles (plan multi-jours),
   séances multi-matières.

En parallèle, la **vue parent** s'enrichit naturellement : elle lit les mêmes
tables (maîtrise par concept, traces de séance typées par activité) — chaque
étape ci-dessus rend le suivi plus riche sans travail dédié majeur.

## 7. Décisions produit à trancher (ordre du brainstorm)

1. **Source des exercices** — tout générer depuis les leçons photographiées
   (fidèle à « l'app suit l'école »), ou accepter des banques/templates par
   niveau pour les automatismes (recommandé : templates pour les automatismes
   uniquement, génération depuis la leçon pour le reste) ?
2. **Fiabilité maths** — valide-t-on la position hybride (déterministe pour le
   calcul, LLM vérifié pour les problèmes) ? Quel comportement quand le
   vérificateur n'est pas sûr : ne pas poser l'exercice, ou le poser sans le
   compter dans la maîtrise ?
3. **Le menu du jour** — imposé (l'enfant suit le programme du tuteur), proposé
   (un tap pour accepter, libre sinon — recommandé), ou libre total comme
   aujourd'hui ?
4. **Gamification** — série de jours + étoiles par concept, plus, ou rien ?
   Visible par le parent ?
5. **Audio** — TTS pour les dictées et les consignes CE2 : on l'assume dès
   l'étape 5 (coût, choix du service), ou on repousse les dictées ?
6. **Rôle du parent dans la boucle** — lecture seule ? priorités de la semaine ?
   validation des leçons ingérées ? visibilité sur les transcripts complets des
   séances ou seulement les résumés ?
7. **Compétences transverses** — on garde les concepts rattachés à leur leçon
   (simple, actuel) et on traite les doublons inter-leçons plus tard, ou on
   introduit tôt un référentiel de compétences durable (fractions, accords…)
   auquel les concepts se rattachent ? (Recommandé : plus tard, sur données
   réelles.)
8. **Préparation de contrôles (6ème)** — dans les 3 prochains mois ou pas ?
   Elle influence le sélecteur de séance (objectif daté vs routine).
