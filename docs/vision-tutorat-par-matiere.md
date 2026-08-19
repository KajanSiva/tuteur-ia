# Vision — un tutorat par matière (primaire & collège)

Document de travail. Les décisions actées au brainstorm sont en §9 ; les
questions encore ouvertes en §10. Périmètre visé à court terme : CE2 et 6ème ;
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

Ce qui est déjà juste dans l'app et ne doit pas bouger : la mémoire est un
ensemble de **concepts** par élève, avec un niveau de maîtrise, un historique
append-only et une politique d'écriture prudente. Ce modèle est agnostique à la
matière.

Ce qui doit devenir pluriel : **l'activité** par laquelle on travaille et on
évalue un concept.

> Un concept a un *type de savoir* ; une séance choisit, pour chaque concept,
> une *activité* adaptée à ce type ; toutes les activités parlent à la mémoire
> par le même contrat (un signal de maîtrise standardisé).

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
  gradeLevel   "CE2" | "6ème" | …
  subject      "Mathématiques" | "Français" | …
  domain       le domaine officiel (maths : nombres et calculs /
               grandeurs et mesures / espace et géométrie ; …)
  parentId     arborescence (domaine → attendu → sous-compétence)
  label        « poser et effectuer une division euclidienne », …
  knowledgeKind fait / notion / méthode / automatisme / production
```

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
confiant (LLM avec seuil ; un concept non rattaché reste valide et rattachable
plus tard). La maîtrise d'un nœud du référentiel s'agrège alors depuis les
concepts de leçons rattachés + les exercices ancrés directement.

**Fabrication du contenu** : fichiers versionnés dans le repo (un par
niveau × matière), curatés une fois avec assistance LLM puis relus — pas de
génération à la volée. Ordre de curation : maths CE2 + 6ème (le plus rentable :
ancre les exercices), puis français, puis les autres matières (où le
référentiel ne sert d'abord qu'à la carte d'avancement).

L'asymétrie voulue : **import de leçons prioritaire en histoire/sciences,
référentiel prioritaire en maths/français** — les deux coexistent partout.

## 4. La séance : une playlist d'activités

Orchestration déterministe, comme aujourd'hui :

1. **Sélection des cibles** — gaps-first + répétition espacée, inter-leçons et
   inter-matières à terme ; les cibles sont des concepts de leçon *ou* des
   nœuds du référentiel (maths).
2. **Choix d'activité par cible** — déterministe : type de savoir + historique
   (varier les modalités) + profil de l'élève.
3. **Exécution** — chaque activité est un module isolé qui rend le même signal
   de maîtrise ; boucle concept par concept inchangée.
4. **Distillation** — inchangée : applier déterministe, silence ≠
   contradiction, historique, trace de séance enrichie du type d'activité.

**Le menu du jour (acté)** : à l'ouverture, le tuteur propose la séance
(« aujourd'hui : 2 exercices de maths, 3 questions d'histoire — ~10 min »),
l'enfant accepte d'un tap. Pas de composition à la volée pour l'instant ;
demander une leçon précise reste possible comme aujourd'hui.

Le modèle « un thread par conversation » (en place depuis le fix
thread-per-conversation) s'aligne naturellement : **une séance = une
conversation** — thread frais, état de routage propre, transcript borné ; la
continuité entre séances vit dans la mémoire durable, pas dans le thread.

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
jamais la réponse, le contenu vient des leçons et du programme officiel.

**Le parent (acté : lecture seule + analyse + import).**
- Lecture seule sur la progression : carte d'avancement par rapport au
  programme (par matière et domaine), maîtrise par concept avec tendance,
  assiduité, points de blocage (concepts qui résistent).
- **Import de documents depuis l'espace parent** : le parent peut téléverser
  les leçons (photos/PDF) pour un enfant — même pipeline d'ingestion que côté
  enfant. Utile quand c'est le parent qui a le cartable sous la main.
- Pas d'édition de la mémoire ni de pilotage des séances pour l'instant.
- Communication : un mécanisme simple d'abord (un résumé périodique dans
  l'espace parent ; notifications plus tard).

**Calibrage par âge.**
- CE2 : séances 5-10 min, consignes minimales, audio utile (TTS), UI simple,
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
  → MasterySignal { status, level, rationale }   // format actuel, obligatoire
}
```

- **La mémoire ne change pas** (applier, tables `mastery*`, politique
  d'écriture). Une activité ratée produit au pire un signal pauvre — elle ne
  peut pas corrompre la mémoire.
- **La boucle de séance devient générique** : queue/cursor/turns actuels,
  paramétrés par l'activité courante.
- **Les activités respectent la sémantique de reprise du chat** : timeout de
  tour, abandon quand le client raccroche, `retry_turn` qui rejoue la tâche en
  attente du checkpoint. Même règle qu'aujourd'hui : aucun effet de bord
  irréversible avant la résolution du concept (les écritures mémoire restent
  au moment de l'avance) — un module d'activité rejouable est un module sûr.
- **Un registre d'activités** (du code) ; ajouter une activité = un dossier
  avec ses nœuds, ses prompts, ses tests et ses cas d'eval, sans toucher au
  reste. Chaque activité a son harnais d'eval — condition pour itérer vite.

### Schéma (delta)

- `CurriculumNode` (cf. §3) + seed versionné par niveau × matière.
- `Concept.knowledgeKind` ; `Concept.curriculumNodeId?` (rattachement).
- La maîtrise reste par (élève, concept) ; les exercices ancrés référentiel
  écrivent sur un concept « du référentiel » matérialisé par élève au premier
  travail (même applier, même historique).
- `session_trace` : entrées typées par activité, avec le détail (énoncé posé,
  réponse donnée) — la vue parent et le debug en dépendent.

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

### TTS (à intégrer dès la conception)

Périmètre : dictées (indispensable) et consignes lues pour le CE2 (confort).
Intégration proposée : un endpoint backend `GET /api/tts?text=…` qui appelle un
service TTS (choix du fournisseur à faire : OpenAI TTS, Google, ElevenLabs…),
avec cache disque par hash du texte (une dictée re-jouée ne re-paye pas), et un
composant audio simple côté front. Le français de qualité et le coût par
caractère sont les critères de choix. Rien d'autre dans l'app n'a besoin de
changer — c'est un service annexe, pas un pilier.

## 8. Chemin d'adaptation depuis l'app actuelle

0. *(à tout moment)* **Bascule de modèles** — pure config par rôle (§7),
   accompagnée de l'extraction du helper d'appel structuré et, pour le
   socratique, validée par le harnais d'eval.
1. **Le contrat d'activité (pure architecture).** Le socratique devient le
   premier module du registre ; boucle de séance générique ; `knowledgeKind` ;
   traces typées. Aucune fonctionnalité nouvelle — le pivot modulaire.
2. **Le référentiel.** Schéma `CurriculumNode` + curation maths CE2 & 6ème +
   rattachement des concepts à l'ingestion + première carte d'avancement
   (lecture seule) dans la vue parent.
3. **Le quiz.** Deuxième activité, la plus simple, toutes matières ; tire ses
   questions des concepts de leçons ET des nœuds du référentiel. Valide le
   contrat à faible risque.
4. **Les exercices maths.** Templates déterministes pour les automatismes,
   génération vérifiée pour les problèmes, formats fermés pour la géométrie ;
   UI d'entrée adaptée (clavier numérique). L'étape qui ouvre vraiment les
   maths CE2/6ème.
5. **Le menu du jour.** Sélecteur inter-leçons/inter-matières (SRS global) +
   proposition à l'ouverture, un tap pour accepter. Conçu d'emblée à deux
   régimes : routine + objectifs datés (les échéances, §4) — la déclaration
   d'échéance arrive ici, le plan à rebours aussi.
6. **Le français au-delà de la grammaire.** Dictée (TTS) puis expression
   écrite courte (retour critérié). Curation référentiel français.
7. **Le collège en propre.** Séances multi-matières plus longues, import de la
   copie corrigée après une échéance.

En parallèle : l'espace parent s'enrichit à chaque étape (il lit les mêmes
tables) + import de documents côté parent (réutilise le pipeline d'ingestion,
peut arriver tôt car indépendant).

## 9. Décisions actées

1. **Référentiel de programme par classe** : oui, embarqué et versionné,
   double rôle (ancrage exercices + carte d'avancement). L'import de leçons
   reste central pour les matières déclaratives.
2. **Vérification par sous-domaine** : déterministe pour le calcul et les
   automatismes ; LLM vérifié par résolution indépendante pour les problèmes ;
   formats fermés pour la géométrie (pas de construction libre pour l'instant).
3. **Menu du jour** : proposé, un tap pour accepter ; pas de composition à la
   volée pour l'instant.
4. **TTS** : intégré à la conception (dictées + consignes CE2), service à
   choisir, cache par texte.
5. **Parent** : lecture seule + analyses par concept/domaine + import de
   documents ; pas d'édition de mémoire ; communication simple d'abord.
6. **Rattachement leçon → référentiel** : à chaque ingestion, les concepts
   extraits sont rattachés aux concepts officiels de la base ; une même
   compétence est dupliquée entre classes (un nœud par niveau, avec la
   profondeur du niveau), les nœuds d'une lignée étant reliés entre eux.
7. **Les échéances dès le départ** : le sélecteur de séance est conçu à deux
   régimes (routine + objectifs datés), car les dates existent dès la primaire
   (évaluations annoncées, poésies) — pas seulement au collège.
8. **Cas du doute à la vérification** : un exercice douteux n'est pas posé ;
   un doute apparu à la correction ne compte pas dans la maîtrise et est
   marqué dans la trace pour inspection.
9. **Mobile natif iOS en phase 2** (repo séparé) : le backend reste la seule
   source de vérité et doit être consommable par un client non-TypeScript —
   auth duale, contrats générés depuis les schémas zod, SSE standard (§10).

## 10. Multi-clients : web aujourd'hui, mobile natif demain

Le backend est traité comme une API pour N clients. État des lieux : le chat
est déjà un protocole client-agnostique (POST + flux de parts JSON typées,
contrats dans `@tuteur/shared`), l'ingestion photo et le futur TTS sont du
HTTP standard. Les conversations sont des threads éphémères par discussion
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

1. **Granularité du référentiel** — jusqu'où descendre (domaine → attendu →
   sous-compétence) : à calibrer pendant la curation maths, sur pièce.
2. **Gamification** — série de jours, étoiles par concept : forme exacte et
   visibilité parent à décider quand le menu du jour existe (elle s'y adosse).
3. **Fournisseur TTS** — qualité du français vs coût ; à évaluer au moment de
   la dictée.
