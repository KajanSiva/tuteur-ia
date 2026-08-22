# Vision — un tutorat par matière (primaire & collège)

Document de travail. Les décisions actées sont en §9 ; les points délégués à
l'implémentation en §11. Périmètre visé à court terme : CE2 et 6ème ;
projection : toute la primaire et le collège.

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

Un seul mode d'évaluation ⇒ soit on n'évalue pas vraiment, soit on exclut des
matières entières.

## 2. Premier pilier : découpler le savoir de l'activité

Ce qui est déjà juste dans l'app et ne doit pas bouger : la **philosophie** de
la mémoire — un état de maîtrise par élève, des historiques append-only, une
politique d'écriture prudente où le déterministe décide et le LLM ne fait que
proposer. Cette philosophie est agnostique à la matière. Sa *mécanique*, en
revanche, évolue (cible canonique, preuves, politique — §7) : c'est un concept
de leçon qui porte la maîtrise aujourd'hui, ce sera une cible pédagogique
demain.

Ce qui doit devenir pluriel : **l'activité** par laquelle on travaille et on
évalue une cible.

> Une cible a un *type de savoir* ; une séance choisit, pour chacune, une
> *activité* adaptée ; toutes les activités parlent à la mémoire par le même
> contrat — non pas un niveau de maîtrise, mais une **preuve** de ce qui s'est
> passé, qu'une politique déterministe replie ensuite en maîtrise.

### Types de savoir

Renseigné à l'ingestion (le parseur le fait déjà pour la barre de précision) :

| Type | Exemples | Se travaille par |
|---|---|---|
| **Fait** | dates, capitales, vocabulaire, définitions | quiz, rappel, socratique |
| **Notion** | la laïcité, la photosynthèse, la monarchie constitutionnelle | dialogue socratique, reformulation |
| **Méthode** | poser une division, accorder un participe | exercices générés, avec variation |
| **Automatisme** | tables, conjugaisons, calcul mental | drill rapide + répétition espacée serrée |
| **Production** | rédaction, expression écrite | consigne + retour critérié |

### Catalogue d'activités (cible, incrémental)

| Activité | Savoirs | Matières typiques | Vérification |
|---|---|---|---|
| **Dialogue socratique** (existant) | notion, fait | histoire-géo, sciences, EMC | juge LLM (existant) |
| **Quiz / questions de connaissance** | fait, automatisme | toutes | fermée (exacte ou juge cheap) |
| **Exercice vérifiable** | méthode, automatisme | maths, physique, grammaire | par sous-domaine, voir §5 |
| **Dictée** | automatisme (orthographe) | français primaire | diff + classification des erreurs |
| **Expression écrite** | production | français | retour critérié (grille), pas de score binaire |
| **Récitation** | fait, automatisme | poésies, tables, verbes irréguliers | rappel guidé |
| *(plus tard)* **Oral / audio** | langues vivantes | anglais | hors périmètre proche |

## 3. Deuxième pilier : le référentiel de programme

**Décision actée.** L'app embarque une **arborescence des concepts à maîtriser
par niveau de classe et par matière**, dérivée des programmes officiels
(BO/Éduscol). C'est le squelette durable sur lequel tout se rattache.

```
CurriculumNode
  code           identifiant stable (survit aux mises à jour du référentiel)
  gradeLevel     code de classe (CE2, SIXIEME, …)
  subject        code matière (MATHS, FRANCAIS, …)
  domain         le domaine officiel (maths : nombres et calculs /
                 grandeurs et mesures / espace et géométrie ; …)
  parentId       arborescence (domaine → attendu → compétence évaluable)
  role           reporting | évaluable
  label          « poser et effectuer une division euclidienne », …
  knowledgeKind  fait / notion / méthode / automatisme / production
  prerequisites  arêtes de prérequis, y compris vers le niveau précédent —
                 un graphe, pas une simple lignée
```

**Trois couches, tranchées dès maintenant** (seuls les volumes se calibrent
pendant la curation) : les nœuds de **reporting** (domaines, attendus — la
carte parent), les **compétences évaluables** (les feuilles, assez fines pour
qu'une série de tentatives fasse foi — l'unité de maîtrise), et les **items**
(les exercices/questions générés pour une compétence — jamais des nœuds). Un
nœud trop large n'est pas évaluable ; un item n'est pas une compétence.

> ⚠️ **À vérifier et ajuster pendant l'implémentation.** La finesse des
> feuilles évaluables est une hypothèse : si une série de tentatives ne
> suffit pas à établir la maîtrise d'une feuille (trop large), ou si la carte
> devient illisible (trop fin), on ajuste la curation — la structure trois
> couches, elle, ne bouge pas.

Le référentiel lui-même porte **source officielle, année d'effet et version** :
« versionné dans git » ne suffit pas à interpréter les données anciennes après
une mise à jour — les codes stables et la version le permettent.

Le référentiel a un **double rôle** :

1. **Ancrage des exercices** pour les matières à savoir-faire. En maths, les
   exercices générés s'ancrent directement sur les nœuds du référentiel — pas
   besoin d'attendre une photo de leçon pour travailler les tables ou la
   division. La leçon photographiée reste utile (elle dit *où en est la
   classe*), mais elle n'est plus indispensable.
2. **Carte d'avancement** pour toutes les matières : où en est l'élève par
   rapport au programme de sa classe (couverture + maîtrise par domaine).
   C'est la brique centrale de la vue parent.

**Le référentiel est par classe, avec la profondeur de la classe.** Une même
compétence revient d'une année sur l'autre (« la division » en CE2 n'est pas
« la division euclidienne » de 6ème) : chaque classe a son nœud propre, avec
l'exigence de son programme. Les nœuds d'une même lignée sont reliés entre
niveaux (le nœud 6ème connaît son antécédent CM2/CE2), ce qui donne deux
choses : le tuteur sait sur quel socle antérieur s'appuyer quand un élève
bloque, et la progression pluri-annuelle est visible (utile quand un enfant
passe dans la classe suivante — sa mémoire ne repart pas de zéro, elle se
reprojette sur les nœuds du nouveau niveau).

**Les leçons importées restent la source d'ancrage des matières déclaratives**
(histoire, sciences…) : c'est ce qui garantit que les questions portent
exactement sur ce que l'enfant a vu en classe. Chaque concept extrait d'une
leçon est **rattaché au nœud de référentiel correspondant** quand le lien est
confiant (un concept non rattaché reste valide et rattachable plus tard). Le
rattachement garde sa **provenance** — modèle, score, statut (proposé /
confirmé) — comme tout le reste de la mémoire : la « confiance » d'un LLM
n'étant pas calibrée, un rattachement contestable doit pouvoir être audité et
défait. La maîtrise d'un nœud s'agrège depuis la cible canonique qu'il
partage avec les concepts rattachés (§7).

**Fabrication du contenu** : fichiers versionnés dans le repo (un par
niveau × matière), curatés une fois avec assistance LLM puis relus — pas de
génération à la volée. Ordre de curation : maths CE2 + 6ème (le plus rentable :
ancre les exercices), puis français, puis les autres matières (où le
référentiel ne sert d'abord qu'à la carte d'avancement).

L'asymétrie voulue : **import de leçons prioritaire en histoire/sciences,
référentiel prioritaire en maths/français** — les deux coexistent partout.

## 4. La séance : une playlist d'activités

Orchestration déterministe, comme aujourd'hui :

1. **Sélection des cibles — parmi les cibles ÉLIGIBLES seulement.** Dans une
   leçon choisie, « jamais évalué » = à travailler : on sait que la leçon a
   été enseignée. Sur le référentiel entier, « jamais évalué » veut le plus
   souvent dire « pas encore abordé en classe » — une exposition à venir, pas
   une lacune. Une cible entre dans le **menu quotidien** seulement si elle a
   été introduite (leçon rattachée) ou incluse dans une échéance. Prérequis
   acquis n'est pas la même chose qu'enseigné : ça rend une cible *disponible
   sur demande* (« on travaille les tables ») sans la faire remonter d'elle-
   même dans le menu. Le gaps-first + SRS s'applique à l'intérieur de ce
   périmètre, jamais au programme entier — sinon le menu propose des notions
   de dans six mois et la carte parent transforme « pas encore enseigné » en
   « retard ».
2. **Choix d'activité par cible** — déterministe : type de savoir + historique
   (varier les modalités) + profil de l'élève.
3. **Exécution** — chaque activité est un module isolé ; la boucle avance
   cible par cible et chaque module rend une **tentative** (`ActivityAttempt`),
   pas un niveau.
4. **Distillation** — même philosophie, mécanique enrichie : une politique
   déterministe replie les tentatives en proposition de maîtrise, que l'applier
   écrit (silence ≠ contradiction, historique append-only). La résolution
   d'une cible — tentative, maîtrise dérivée, progression de séance — est une
   seule transaction idempotente.

**Le menu du jour (acté)** : à l'ouverture, le tuteur propose la séance
(« aujourd'hui : 2 exercices de maths, 3 questions d'histoire — ~10 min »),
l'enfant accepte d'un tap. Pas de composition à la volée pour l'instant ;
demander une leçon précise reste possible comme aujourd'hui.

**La séance est une entité métier persistée** (`StudySession` : playlist de
cibles planifiées, curseur, source — routine / échéance / demande explicite —,
horodatages début/fin/abandon), pas un simple thread de chat. Le thread
LangGraph reste son véhicule conversationnel (thread frais par séance, état de
routage propre) mais ne définit pas son identité : le frontend crée
aujourd'hui une conversation par chargement de page, qui peut mélanger une
ingestion et plusieurs révisions — ce n'est pas une frontière métier. C'est la
séance persistée qui porte la reprise après interruption, l'assiduité et le
taux de complétion que la vue parent affiche.

**Reset produit entre les blocs (acté).** Chaque bloc de révision ouvre un
thread de conversation neuf et clôt le précédent : un enfant qui enchaîne
plusieurs séances n'accumule jamais un transcript géant — la fenêtre de
contexte du LLM est bornée par le bloc, et la continuité entre blocs passe par
la mémoire durable, pas par le fil de discussion.

**Les échéances (acté).** Le sélecteur poursuit deux régimes, dès sa
conception : la **routine** (répétition espacée globale) et les **objectifs
datés**. Une échéance = matière, date, périmètre (leçons/chapitres, ou une
poésie, une dictée préparée) déclarée par l'enfant ou le parent. Ce n'est pas
un sujet « collège » : dès le CE1-CE2, les évaluations s'annoncent et les
poésies se donnent à une date. Quand une échéance approche, le plan se
construit à rebours de la date (couverture du périmètre → travail ciblé des
faiblesses → synthèse rapide la veille) et le menu du jour le reflète ; après
l'échéance, retour à la routine. Plus tard : importer la copie corrigée pour
recaler la mémoire.

**Implémentation repoussée après le jalon (acté).** On restructure d'abord ;
l'architecture prévoit l'échéance dès le départ (sélecteur à deux régimes,
`StudySession.source`) pour qu'elle s'ajoute ensuite par-dessus, sans reprise.

## 5. Vérification : par matière ET par sous-domaine

Une correction fausse détruit la confiance de l'enfant et du parent. Décision
actée : **la stratégie de vérification se choisit par sous-domaine, pas par
matière** — au sein des maths, ce qui est fiable pour le calcul ne l'est pas
pour la géométrie.

| Sous-domaine (exemples) | Génération | Vérification |
|---|---|---|
| Automatismes (tables, opérations, conversions) | templates paramétrés déterministes | calcul — fiabilité totale, zéro LLM |
| Problèmes d'application (énoncés libres) | LLM depuis leçon/référentiel, **vérifié par résolution indépendante avant d'être posé** | comparaison au résultat vérifié + explication socratique en cas d'erreur |
| Espace et géométrie | prudence : formats fermés d'abord (reconnaissance, propriétés, vocabulaire, petits calculs de périmètre/aire) | fermée/déterministe ; les constructions libres sont **hors périmètre** tant qu'on n'a pas une vérification fiable |
| Grammaire/conjugaison | templates + banques dérivées du référentiel | fermée (réponse attendue connue) |

Le registre d'activités porte donc, par nœud de référentiel, la stratégie
autorisée — c'est une donnée du référentiel, pas une heuristique en prompt.

Cas du doute (vérificateur pas sûr) : *proposition par défaut, à valider à
l'implémentation* — l'exercice douteux n'est pas posé (on en tire un autre) ;
si le doute apparaît à la correction, l'échange ne compte pas dans la maîtrise
et est marqué dans la trace pour inspection.

## 6. Autonomie de l'enfant, suivi du parent

**L'enfant fait tout seul.** Menu du jour en un tap, demande libre d'une leçon,
ingestion photo à sa main. Le système est sûr par construction : il ne donne
jamais la réponse *tant que l'élève cherche* — mais une fois la cible résolue
(réussie ou forcée après plusieurs essais), montrer la correction expliquée
fait partie de l'apprentissage, pour les exercices surtout. Le contenu vient
des leçons et du programme officiel.

**Le parent (acté : lecture seule + analyse + import).**
- Lecture seule sur la progression : carte d'avancement par rapport au
  programme (par matière et domaine), maîtrise par concept avec tendance,
  assiduité, points de blocage (concepts qui résistent).
- **Import de documents depuis l'espace parent** : le parent peut téléverser
  les leçons (photos/PDF) pour un enfant — même pipeline d'ingestion que côté
  enfant. Utile quand c'est le parent qui a le cartable sous la main.
- Pas d'édition de la mémoire ni de pilotage des séances pour l'instant.
  Déclarer une échéance n'est pas du pilotage : c'est une information
  factuelle sur l'école (une date, un périmètre), au même titre qu'une photo
  de leçon.
- Communication : un mécanisme simple d'abord (un résumé périodique dans
  l'espace parent ; notifications plus tard).

**Calibrage par âge.**
- CE2 : séances 5-10 min, consignes minimales, UI simple,
  encouragements, gamification légère à trancher.
- 6ème : séances 15-20 min, plusieurs matières ; plus tard la préparation de
  contrôles (plan multi-jours).

## 7. Architecture cible

### Le contrat d'activité

Extraire de `revise.ts` la notion générique de « travailler une cible » :

```
ActivityModule = {
  type: "socratic" | "quiz" | "exercise" | "dictation" | …
  accepts(target, student): boolean      // type de savoir, sous-domaine, âge
  nodes / edges (LangGraph)              // dialogue en un ou plusieurs tours
  → ActivityAttempt                      // une preuve d'apprentissage, append-only
}
```

**Les activités produisent des preuves, pas des niveaux.** La sortie du
contrat n'est pas un niveau de maîtrise mais un **événement de tentative**
(`ActivityAttempt`, append-only) : cible, activité, item posé (énoncé,
variante, version de template), exactitude, essais, indices utilisés,
vérificateur employé, doute éventuel. Une **politique déterministe** replie une
série de tentatives en proposition de maîtrise, en pesant trois choses : le
type de savoir (un automatisme demande de la répétition, une notion non), et
surtout **l'activité et la qualité de la preuve** — une réussite vérifiée
déterministiquement, un quiz réussi après un indice et une appréciation
socratique d'un juge LLM ne valent pas le même poids. Répondre juste à 7×8 une
fois ne valide pas « les tables » ; trois erreurs avec indices ne valent pas
une réussite du premier coup. Le socratique garde son signal
actuel `{ status, level, rationale }` comme *contenu* de sa tentative :
l'évaluateur LLM propose, la politique décide, l'applier écrit.

- **La philosophie mémoire ne change pas ; le schéma, si.** Applier,
  historiques append-only, silence ≠ contradiction : intacts. Mais le schéma
  évolue (cible canonique, tentatives, séances — delta ci-dessous). Et la
  couche « politique » est ce qui empêche réellement une activité défectueuse
  de polluer la maîtrise : zod garantit la *forme* d'un signal, jamais sa
  justesse — aujourd'hui le niveau proposé par l'évaluateur est appliqué
  directement ; demain il transite par la politique.
- **La boucle de séance devient générique** : queue/cursor/turns actuels,
  paramétrés par l'activité courante.
- **Reprise sûre = idempotence + transaction.** La sémantique de reprise
  (timeout de tour, abandon client, `retry_turn` qui rejoue la tâche pendante)
  exige plus que « pas d'effet de bord avant résolution » : aujourd'hui la
  maîtrise puis la trace s'écrivent en deux opérations séparées, et un NOOP
  rejoué avance quand même l'échelle SRS (le touch est stampé même sans
  changement d'état). La résolution d'une cible devient UNE transaction —
  tentative + maîtrise dérivée + progression de séance — sous une clé
  idempotente (séance, cible, tour), pour qu'un rejeu soit un vrai no-op.
- **Un registre d'activités** (du code) ; ajouter une activité = un dossier
  avec ses nœuds, ses prompts, ses tests et ses cas d'eval, sans toucher au
  reste. Le registre se conçoit contre DEUX activités dès le départ
  (socratique refactoré + quiz fermé) : une abstraction extraite d'un seul
  cas épouse ce cas.

### Schéma (delta)

Le pivot : une **cible pédagogique canonique** (`LearningTarget`) porte la
maîtrise — pas le concept de leçon, qui aujourd'hui exige une leçon et
dupliquerait la maîtrise entre deux leçons couvrant le même attendu :

```
CurriculumNode ──┐
                 ├─→ LearningTarget ←── Mastery (+ historique)
LessonConcept ───┘         ↑     ↑
                           │     └── StudentTargetState (exposition, par élève)
                    ActivityAttempt (append-only)
                           ↑
                    StudySession → items planifiés
```

- `Concept` est renommé **`LessonConcept`** — ce qu'il est réellement : un
  concept extrait d'une leçon, avec sa provenance. Il ne porte plus la
  maîtrise.
- Un `LessonConcept` rattaché au référentiel partage la cible du nœud : deux
  leçons sur le même attendu nourrissent UNE maîtrise. Un concept non
  rattaché porte sa propre cible (rattachable plus tard — la fusion de
  maîtrises passe par l'applier, avec historique). Les exercices ancrés
  référentiel visent la cible du nœud directement, sans leçon.
- **Exposition ≠ maîtrise** : `StudentTargetState` porte, par (élève, cible),
  l'état d'exposition (jamais abordé / introduit — par une leçon rattachée,
  une demande explicite ou une échéance / en entraînement), distinct du niveau
  de maîtrise. C'est ce qui rend le sélecteur et la carte parent honnêtes (§4).
- `ActivityAttempt` (append-only) et `StudySession` + ses items (§4)
  **remplacent** `SessionTrace` comme support métier de la séance.
- `subject` et `gradeLevel` deviennent des **codes stables** (plus de chaînes
  libres) — le référentiel l'exige.
- `knowledgeKind` porté par la cible, renseigné à l'ingestion ou par le
  référentiel.

### Modèles par rôle et appels structurés

**Changer de modèle est déjà de la pure config** (factory par rôle,
`llm/models.ts` : `LLM_PROVIDER_<ROLE>` / `LLM_MODEL_<ROLE>`) — seule la
dépendance `@langchain/<provider>` est à installer. Faisable à tout moment,
indépendamment du reste (« étape 0 »). Méthode pour basculer vers un modèle
moins cher (ex. `gpt-5.6-luna`) :

- **rôles contraints d'abord** (classifier, evaluate, session_analysis) —
  sortie structurée validée par zod, risque faible ;
- **le socratique en dernier** — c'est l'âme du produit : valider avant/après
  avec le harnais d'eval (`pnpm eval`) ;
- **le juge reste sur un modèle fort et différent** de celui qu'il évalue ;
- `ingest_parse` exige un modèle à entrée image.

**Une seule abstraction à ajouter, pas une couche.** LangChain
(`initChatModel` → `BaseChatModel`) est déjà la couche d'abstraction
fournisseur — en rajouter une par-dessus serait de la sur-ingénierie. En
revanche, le motif d'appel structuré (garde `bindTools`, tool forcé par
`tool_choice`, `safeParse` de `tool_calls[0].args`, repli conservateur en cas
de sortie malformée) est aujourd'hui dupliqué sur 7 sites dans 6 fichiers.
À extraire en un helper unique (`llm/structured.ts`, style
`invokeStructured(role, { tool, schema, messages, fallback })`) : c'est
précisément là que les différences entre fournisseurs mordent (forme des
tool-calls, réponses vides, contraintes des modèles de raisonnement — p. ex.
la température refusée par certains). Un seul endroit à durcir au lieu de
sept, et chaque nouvelle activité en profite. À faire dans l'étape 1 (le
contrat d'activité y touche déjà) ou juste avant une bascule de fournisseur.

## 8. Chemin d'adaptation depuis l'app actuelle

### Le contexte qui autorise une refonte franche

L'app est déployée mais **pas encore réellement utilisée** : les données en
base sont des essais. Il n'y a donc ni compatibilité à préserver, ni migration
de données à écrire — et c'est exactement le moment où poser la structure
cible coûte le moins cher. Conséquences assumées :

- **Breaking changes libres.** Pas de dual-write, pas de couche de
  compatibilité temporaire, pas de backfill : le schéma cible est écrit
  directement.
- **Historique de migrations remis à plat.** Plutôt que d'empiler des
  migrations de transition autour du POC, on repart d'une migration initiale
  propre et on recrée la base.
- **À vérifier avant destruction** (seul garde-fou) : qu'aucune leçon, image
  de leçon (volume `/data/uploads`) ni configuration ne mérite d'être
  conservée. Les threads du checkpointer, eux, sont éphémères par conception.
  Corollaire pratique : si les enfants utilisent l'app d'ici là, leurs leçons
  photographiées partiront aussi — à re-photographier après la bascule, ou à
  décider de conserver (et alors il faudra un script d'import, pas une
  migration).

**La règle de livraison incrémentale change de raison, pas de valeur.** Les
petites tranches ne servent plus à préserver la production (elle est
jetable) mais à **rendre les erreurs visibles tôt** : chaque commit garde
`typecheck` et la suite de tests **verts**, avec des tests précis sur le
comportement introduit. En revanche une tranche intermédiaire n'a plus besoin
d'être déployable ni fonctionnellement complète : « vert à chaque commit »
remplace « déployable à chaque commit ».

### Les étapes

0. *(optionnelle, non bloquante)* **Bascule de modèles** — pure config par
   rôle (§7) + extraction du helper d'appel structuré. Ne fait PAS partie du
   jalon : si les modèles actuels conviennent, elle ne doit rien retarder ;
   à faire quand le coût le justifie.
1. **La fondation** — le pivot de tout le plan, en cinq tranches vertes :
   1. **Schéma cible + repositories et politique mémoire portés dessus.**
      `LessonConcept` (l'ancien `Concept`, renommé pour ce qu'il est),
      `LearningTarget` canonique portant la maîtrise, `StudentTargetState`
      (exposition), `CurriculumNode` avec codes et version,
      `subject`/`gradeLevel` en codes stables. Schéma et repositories vont
      ensemble : les types Prisma générés se propagent immédiatement dans
      l'applier, l'hydratation et les graphes — les séparer donnerait un
      commit rouge sans rien apprendre.
   2. **`ActivityAttempt` + résolution idempotente et transactionnelle**
      (tentative + maîtrise dérivée + progression, une transaction, une clé
      d'idempotence) + la politique qui replie les preuves en maîtrise.
   3. **`StudySession` + ses items + reset de thread**, autour du socratique
      actuel ; `SessionTrace` disparaît.
   4. **Le socratique porté** sur la nouvelle structure (il produit une
      tentative, plus un niveau).
   5. **Le quiz fermé + extraction du registre** au contact réel des deux
      activités — jamais avant : un registre extrait d'un seul cas épouse ce
      cas.

   **Contrainte non négociable de la refonte** : le schéma peut casser, pas
   les *comportements* couverts par les tests. Les cas denses de l'applier
   (silence ≠ contradiction, merge par champ, `is_locked`, provenance de
   l'historique, atomicité, échelle SRS) sont le capital du projet — ils sont
   re-pointés sur les cibles, jamais supprimés. Le harnais d'eval du
   socratique suit la même règle.
2. **Le référentiel.** Structure trois couches (§3) + curation verticale :
   maths CE2 d'abord (quelques compétences suffisent à ancrer l'étape 4a),
   6ème dans la foulée ; rattachement des concepts à l'ingestion avec
   provenance ; carte d'avancement minimale et honnête (« pas encore abordé »
   distinct de « en difficulté »).
3. *(absorbée par l'étape 1 — le quiz naît avec le registre.)*
4. **Les exercices maths.** Templates déterministes pour les automatismes,
   génération vérifiée pour les problèmes, formats fermés pour la géométrie ;
   UI d'entrée adaptée (clavier numérique). L'étape qui ouvre vraiment les
   maths CE2/6ème.
5. **Le menu du jour.** Sélecteur sur les seules cibles **éligibles** (§4),
   playlist persistée (`StudySession`), proposition à l'ouverture, un tap,
   reset de thread entre les blocs. L'interface à deux régimes (routine +
   objectifs datés) est posée ici ; l'implémentation des échéances s'ajoute
   après le jalon, par-dessus. La vue parent se branche sur les tentatives et
   séances réelles (activité, progression, blocages, assiduité).
6. **Le français au-delà de la grammaire.** Dictée puis expression écrite
   courte (retour critérié) ; curation référentiel français. L'audio
   nécessaire à la dictée se conçoit à ce moment-là — pas avant.
7. **Le collège en propre.** Séances multi-matières plus longues, import de la
   copie corrigée après une échéance.

En parallèle : l'espace parent s'enrichit à chaque étape (il lit les mêmes
tables) + import de documents côté parent (réutilise le pipeline d'ingestion,
peut arriver tôt car indépendant).

### Le jalon « les enfants testent »

L'objectif court terme n'est pas la vision complète : c'est un état testable
par les enfants en autonomie, pour en tirer des apprentissages réels avant
d'aller plus loin. Le déploiement continu étant en place, une étape complète
part en production dès qu'elle est verte. Trois conséquences sur le chemin :

- **L'étape 4 se scinde.** 4a — templates déterministes + UI de saisie
  numérique : rapide, fiabilité totale, l'essentiel de la valeur CE2. 4b —
  problèmes à génération vérifiée : le morceau le plus incertain du plan
  (boucle qualité/eval longue), repoussé APRÈS le jalon — l'usage réel dira
  quels types de problèmes comptent.
- **L'étape 2 se resserre pré-jalon** : vertical maths CE2 d'abord — quelques
  compétences évaluables bien choisies plutôt qu'une couverture large ; 6ème
  si la cadence tient. La structure trois couches est fixée, seuls les volumes
  sont timeboxés. La curation reste le pôle de risque temps (du contenu à
  relire, pas du code) : approfondie post-jalon sur données réelles.
- **L'étape 5 fait partie du jalon.** Le menu du jour est ce qui crée l'usage
  autonome quotidien — précisément ce qu'on veut observer. Version jalon :
  régime routine sur cibles éligibles + playlist persistée + reset de thread
  entre les blocs. Les échéances : conçues dans l'architecture, implémentées
  juste après le jalon (décision §9.6).

**Jalon = 1 (fondation, 6 tranches) + 2-vertical + 4a + 5-simple.** L'étape 0
en est explicitement exclue. Post-jalon, piloté par les apprentissages :
échéances, 4b, 6 (dictée, écriture), 7 (collège), approfondissement du
référentiel, gamification.

Le jalon est ambitieux comme *cap*, et c'est assumé : le risque n'est pas sa
taille mais qu'il devienne un chantier indivisible. Il ne l'est pas — 1.1 à
1.5 puis 2, 4a, 5 sont autant de tranches vertes et revues une à une. La
seule règle qui compte : jamais deux tranches en vol en même temps.

## 9. Décisions actées

1. **Référentiel de programme par classe** : oui, embarqué et versionné,
   double rôle (ancrage exercices + carte d'avancement). L'import de leçons
   reste central pour les matières déclaratives.
2. **Vérification par sous-domaine** : déterministe pour le calcul et les
   automatismes ; LLM vérifié par résolution indépendante pour les problèmes ;
   formats fermés pour la géométrie (pas de construction libre pour l'instant).
3. **Menu du jour** : proposé, un tap pour accepter ; pas de composition à la
   volée pour l'instant.
4. **Parent** : lecture seule + analyses par concept/domaine + import de
   documents ; pas d'édition de mémoire ; communication simple d'abord.
5. **Rattachement leçon → référentiel** : à chaque ingestion, les concepts
   extraits sont rattachés aux concepts officiels de la base ; une même
   compétence est dupliquée entre classes (un nœud par niveau, avec la
   profondeur du niveau), les nœuds d'une lignée étant reliés entre eux.
6. **Les échéances : conçues dès le départ, implémentées après le jalon.**
   L'architecture prévoit les deux régimes (routine + objectifs datés) dès sa
   conception — les dates existent dès la primaire — mais la fonctionnalité
   s'ajoute par-dessus, une fois la restructuration livrée.
7. **Cas du doute à la vérification** : un exercice douteux n'est pas posé ;
   un doute apparu à la correction ne compte pas dans la maîtrise et est
   marqué dans la trace pour inspection.
8. **Mobile natif iOS en phase 2** (repo séparé) : le backend reste la seule
   source de vérité et doit être consommable par un client non-TypeScript —
   auth duale, contrats générés depuis les schémas zod, SSE standard (§10).
9. **Revue croisée intégrée** : cible pédagogique canonique
   (`LearningTarget`) porteuse de la maîtrise ; preuves d'apprentissage
   append-only (`ActivityAttempt`) repliées en maîtrise par une politique
   déterministe ; séance persistée (`StudySession`) distincte du thread de
   chat ; éligibilité par exposition (inconnu ≠ lacune) ; résolution
   idempotente et transactionnelle ; registre conçu contre deux activités.
10. **Reset produit entre les blocs de révision** : un thread neuf par bloc,
    contexte LLM borné, continuité par la mémoire durable (§4).
11. **TTS retiré de la vision** : itération ultérieure, à concevoir avec la
    dictée (étape 6) — rien à préparer d'ici là.
12. **Refonte franche assumée** : l'app n'étant pas encore réellement
    utilisée, on écrit le schéma cible directement — breaking changes libres,
    aucune couche de compatibilité, historique de migrations remis à plat,
    base recréée (§8). La livraison en petites tranches reste la règle, mais
    pour rendre les erreurs visibles tôt : **vert à chaque commit**, plus
    « déployable à chaque commit ».
13. **Bascule de modèles hors jalon** : optionnelle et non bloquante — elle ne
    doit jamais retarder un test enfant si les modèles actuels conviennent.

## 10. Multi-clients : web aujourd'hui, mobile natif demain

Le backend est traité comme une API pour N clients. État des lieux : le chat
est déjà un protocole client-agnostique (POST + flux de parts JSON typées,
contrats dans `@tuteur/shared`), l'ingestion photo est du HTTP standard. Les conversations sont des threads éphémères par discussion
(`student-{id}-{conversationId}`, id généré par le client, format contraint
par `ConversationIdSchema`) ; la mémoire durable, elle, est par élève — un
enfant qui alterne web et mobile a des discussions distinctes mais une seule
mémoire. Le seul couplage web restant est l'auth par cookie.

Changements backend requis (petits, à faire au moment du chantier mobile) :

1. **Auth duale** — accepter le token aussi en `Authorization: Bearer` et le
   retourner dans le corps du login ; le mobile le stocke en keychain, le web
   garde son cookie httpOnly.
2. **HTTPS public** — ✅ en place : images Docker + CI → déploiement derrière
   TLS ; le prérequis mobile est satisfait.
3. **Contrats additifs seulement** — une app installée se met à jour après le
   backend ; les évolutions de contrat restent rétro-compatibles. Le client
   mobile génère ses conversation ids et implémente `retry_turn` comme le web.
4. **Push notifications** (plus tard) — l'ajout FCM/APNs portera le mécanisme
   de communication parent.

**Décision actée : mobile 100 % natif, iOS d'abord (Swift), en phase 2, dans
un repository séparé.** Le développement mobile n'est pas détaillé ici — ce
document n'en retient que la contrainte qu'il impose au backend : être
consommable par un client non-TypeScript. Concrètement, en plus des points
ci-dessus :

5. **Contrats générés, pas partagés** — les types de `@tuteur/shared` ne
   traversent pas vers Swift ; les schémas zod du backend deviennent la source
   d'un contrat généré (OpenAPI/JSON Schema) que le repo iOS consomme. À
   mettre en place au démarrage de la phase 2 ; d'ici là, la discipline
   « toute la surface API est décrite par des schémas zod » suffit.
6. **Le flux de chat reste du SSE standard** — parsable côté Swift avec
   URLSession ; aucun SDK propriétaire requis côté client.

D'ici la phase 2, le web actuel en PWA installable (icône, plein écran, photo
via navigateur) sert d'app mobile de transition.

## 11. Points délégués à l'implémentation

Tranchés sur pièce au moment concerné, pas bloquants pour la vision :

1. **Volumes du référentiel** ⚠️ — la *structure* (reporting / évaluable /
   items) est tranchée (§3) ; le nombre de nœuds et la finesse des feuilles
   sont des hypothèses à vérifier et ajuster explicitement pendant
   l'implémentation (voir l'avertissement du §3).
2. **Gamification** — série de jours, étoiles par concept : forme exacte et
   visibilité parent à décider quand le menu du jour existe (elle s'y adosse).
