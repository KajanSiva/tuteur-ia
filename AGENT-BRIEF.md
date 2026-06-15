# Tuteur IA Socratique — Brief d'initialisation projet


## 0. Contexte (pour un agent qui arrive à froid)

POC d'un **tuteur IA socratique à mémoire compounding** pour aider une élève (CM2, Histoire) à comprendre par elle-même. La mémoire de l'IA (modèle élève relu/réécrit séance après séance) la fait progresser. **Vision produit** : utilisable en autonomie par une enfant — elle lance l'app, dit "fais-moi réviser la leçon 13" ou "j'ai reçu une nouvelle leçon, prends-la en compte", et tout se passe dans un seul chat.

Le **lot 1** (déjà fait, repo `tuteur-ia-poc-cc`) était file-based piloté par Claude Code + markdown — validé par l'usage, mais ne démontre aucune ingénierie agentique. **Le lot 2 (ce projet) reconstruit le système "production-shaped"** pour démontrer le raisonnement d'ingénierie.

**Le moat = l'architecture, pas le framework ni l'UI.** Cf. principes ci-dessous. "Je l'ai réécrit en LangGraph" sans ce raisonnement = commodité = zéro valeur.

### Note de cadrage importante (déterminisme vs flexibilité)
Construire un agent *fiable* exige beaucoup de choix détaillés — c'est le travail, pas un détour. Le fil conducteur : **contraindre la plomberie (orchestration, quand écrire la mémoire, quel flow tourne) ; laisser ouverte la pédagogie (la conversation socratique).** La compétence du produit vit dans le nœud socratique et dans la qualité de l'hydratation mémoire qui le nourrit — pas dans un prompt "malin". Scope de domaine étroit = force (fiabilité), pas faiblesse. Le risque à éviter n'est PAS "trop déterministe" mais l'inverse : donner trop d'autonomie d'orchestration au LLM (imprévisible, cher, indébuggable).

### Périmètre de CETTE init
- ✅ Scaffold monorepo + **un seul endpoint `/api/chat`** routé par intents (voir §5/§6).
- ✅ **DB Postgres** (schéma + migrations) comme source de vérité domaine (voir §4).
- ✅ **Chat basique uniquement** (texte). Pas de mascotte, pas d'UI centrale, pas de composant UI spécifique par question.
- ✅ **Architecture évolutive** : rendu *parts-based dès le jour 1* pour ajouter des **composants custom par question / cartes de confirmation** plus tard **sans refonte** (juste un `case` de plus). Voir §7 et §8.

---

## 1. Principes directeurs (non négociables)

1. **Orchestration en code déterministe** (graphe orienté), **LLM uniquement dans les nœuds** qui ont besoin d'intelligence. Le LLM n'orchestre jamais. (C'est le pattern LangGraph "workflow / router", *pas* l'agent autonome ni le "supervisor" LLM-orchestré.)
2. **L'update mémoire = nœud déterministe** : le LLM *propose* des opérations structurées (zod), un **applier déterministe** les exécute en DB. Jamais "le LLM réécrit la fiche en aveugle".
3. **Altitude par nœud** : code déterministe (plomberie) / appel LLM contrôlé + output structuré (raisonnement cadré) / harness d'agent complet (seulement les nœuds vraiment agentiques — ici, le nœud socratique). Documenter chaque choix.
4. **Front = client mince.** Ne doit jamais devenir le projet. Le re-sharpening React est un byproduct, pas un driver de scope.
5. **Stateless au transport, stateful dans des stores explicites** (voir §9).
6. **Working memory (thread, jetable) ≠ long-term memory (DB, durable).** Le thread est le scratch d'une séance ; le modèle élève en DB est le produit. **Jamais de mémoire durable conditionnée à une fermeture propre de l'app** → distillation incrémentale (§4.6).
7. **Évolutif par défaut** : rendu parts-based, data parts typées centralisées, composition de stream prête à accueillir des `data-*` (voir §7).
8. **YAGNI** : on ne *construit* pas la mascotte / l'UI centrale / les composants par question / l'édition chirurgicale de leçon maintenant. On garde juste l'archi *compatible*.

---

## 2. Stack (à pinner dans package.json + à vérifier)

| Besoin | Choix |
|---|---|
| Monorepo | **pnpm workspaces + Turborepo** (pas Nx) |
| Backend | **Fastify** (API mince) + **LangGraph.js** (`@langchain/langgraph`) in-process |
| LLM dans les nœuds | classes modèle LangChain + `withStructuredOutput(zod)` pour le structuré. **Accès via une factory par-rôle** (voir ci-dessous) — jamais de modèle hardcodé dans un nœud |
| **DB domaine** | **PostgreSQL** (local via docker compose). Accès typé via **Prisma** (ORM connu ; migrations + seed batteries-included) + Zod pour valider les payloads d'extraction LLM. ⚠️ Les tables `*_history` s'écrivent **dans le code de l'applier (transaction)**, **pas par triggers DB** (Prisma ne modélise pas les triggers proprement ; l'applier explicite colle aussi mieux au narratif). Choix de commodité, hors moat |
| Checkpointer LangGraph | `PostgresSaver` (`@langchain/langgraph-checkpoint-postgres`) ; in-memory pour les tests. **Sur le graphe parent uniquement** |
| Adaptateur stream | **`@ai-sdk/langchain`** (`toUIMessageStream`, `toBaseMessages`) |
| Frontend | **React + Vite** + **`@ai-sdk/react`** (`useChat`) — **AI SDK v6** |
| Types partagés | package `shared` (TS) |
| Observabilité / coût | **OpenTelemetry → Langfuse** (étape ultérieure, pas au scaffold) |
| Eval | LLM-as-judge x2 via Langfuse (étape ultérieure) |
| Conteneurisation | **docker compose** (backend + **Postgres** + Langfuse + deps) |

### Factory modèle par-rôle (décision 09/06)
Le provider/modèle ne doit **jamais** être hardcodé dans un nœud. Une factory `getModel(role)` mappe un **rôle** → `{ provider, model, temperature }`, surchargeable par env.

```ts
// llm/models.ts
type Role = "classifier" | "ingest_parse" | "socratic" | "session_analysis" | "judge";
function getModel(role: Role): BaseChatModel { /* config par-rôle, env-overridable */ }
```
- **Pourquoi par-rôle et pas un modèle global** : c'est ce qui permet plus tard de tourner le socratique sur un modèle fort et la classification/extraction sur un modèle cheap, et de raconter le tradeoff coût/qualité (pilier C). Concevoir l'abstraction par-rôle **dès le jour 1** (gratuit maintenant, cher à rétrofitter).
- **MVP** : seam + override manuel par env pour tester le ressenti à la main. Pas de harness qui *choisit* le modèle (ça c'est B/C, plus tard).
- Provider par défaut = **Anthropic Claude**, mais l'archi est **provider-agnostique** (LangChain absorbe l'interface ; `withStructuredOutput(zod)` marche cross-provider — tester le structuré sur chaque provider activé).
- **Contrainte vision** : le rôle `ingest_parse` doit pointer un **modèle multimodal** (analyse d'images de leçon, §5.2) → le swap provider est contraint sur ce rôle aux candidats vision-capable.

> ⚠️ **AI SDK v6 est récent (sortie 2026).** Avant de coder le streaming, **vérifier les noms/signatures exacts contre la version installée** : `toUIMessageStream`, `createUIMessageStreamResponse`, `createUIMessageStream` (writer), `useChat` (`onData`, `sendMessage`, config `transport`/`prepareSendMessagesRequest`), data parts `transient`, `addToolOutput`. Pinner les versions et consulter la doc courante (ai-sdk.dev). Ne pas présumer la nomenclature v5.
> Node **20+**, pnpm.

---

## 3. Structure du repo

```
tuteur-ia-lot2/
├── apps/
│   ├── backend/                 # Fastify + LangGraph.js
│   │   └── src/
│   │       ├── server.ts        # bootstrap Fastify, la route /api/chat
│   │       ├── api/             # handler chat (stateless) + guard resume-vs-message (§6)
│   │       ├── graphs/
│   │       │   ├── router.graph.ts    # graphe parent : classify → conditional edges
│   │       │   ├── ingest.graph.ts    # sous-graphe "Ingérer une leçon"
│   │       │   ├── revise.graph.ts    # sous-graphe "Réviser" (le cœur)
│   │       │   └── qa.graph.ts        # sous-graphe "Q&A sur une leçon"
│   │       ├── nodes/           # nœuds (déterministes + LLM)
│   │       ├── memory/          # repos lecture + hydratation + applier (politique PURE + coquille tx) + contrat d'ops zod
│   │       ├── db/              # client Prisma 7 (driver adapter pg) ; schéma + migrations sous prisma/
│   │       ├── llm/             # factory modèles par-rôle, schémas zod, structured output
│   │       ├── streaming/       # seam LangGraph → UIMessageStream → Fastify reply ; interrupt → data part
│   │       └── checkpoint/      # PostgresSaver (checkpointer LangGraph)
│   └── frontend/                # React + Vite
│       └── src/
│           ├── chat/            # useChat, rendu parts-based, guard resume côté front
│           ├── components/      # bulles, ConfirmCard (HIL), (panneau modèle élève = optionnel)
│           └── state/           # store léger (prêt pour UI partagée future)
├── packages/
│   └── shared/                  # types TS partagés (TutorUIMessage typé, contrats API, types mémoire, enum d'intents)
├── docker-compose.yml           # backend + Postgres + (Langfuse plus tard)
├── turbo.json
├── pnpm-workspace.yaml
└── AGENT-BRIEF.md               # ce fichier
```

> ⚠️ Plus de dossier `data/` versionné git. Le **git-versioning des données est abandonné** (bloat du diff à l'échelle + privacy). La source de vérité domaine = **Postgres** (§4).

---

## 4. Modèle mémoire (source de vérité domaine) — **DB Postgres**

La mémoire durable vit en **Postgres**, pas en fichiers markdown. Elle est **distincte des messages de chat** (éphémères, dans le checkpointer). S'inspirer des patterns de l'écosystème (LangMem profile, mem0 op-set, Letta memory blocks, taxonomie CoALA) mais **réimplémenter soi-même** (LangMem est Python ; on veut le relationnel + audit + intégrité Postgres ; et câbler ce nœud *est* l'ingénierie nommable du lot 2).

> ⚠️ **Stabilité du modèle mémoire — l'étape 1 a été construite AVANT son consommateur (les nœuds LLM de l'étape 2).** Distinguer deux registres :
> - **Invariants FIGÉS** (ne pas remettre en cause) : (a) les 2 formes état/collection (§4.1) ; (b) la politique d'écriture — merge par champ, silence≠contradiction, DELETE sur contradiction explicite (§4.5) ; (c) état courant **+** history dans une seule transaction (§4.2) ; (d) le découpage functional core / imperative shell de l'applier.
> - **Contrats de SURFACE provisoires** (attendus de bouger quand l'étape 2 les exerce pour de vrai) : la forme exacte des ops zod (`MasteryOpSchema`/`ProfileOpSchema`), la granularité de `mastery.level` `{emerging, developing, secure}`, les 3 dimensions de `student_profile`, la sémantique de `force`. *(`mastery.confidence` : **retirée le 14/06** — write-only sans consommateur ; on la réintroduira si un consommateur réel la réclame. Cf. §16.)*
> **C'est sain de les ajuster** : laisser le besoin réel du nœud socratique / d'analyse piloter ces changements (migration légère + maj des tests), plutôt que de figer des hypothèses. À l'inverse : **ne pas *étendre* la mémoire** (rollback, `observation`, nouvelles dimensions) sans un consommateur qui le réclame.

### 4.1 Les deux formes de mémoire (détermine l'op-set)
- **Forme "état" — schéma fixe, une ligne.** Ex : `student_profile` (un contrat de propriétés connues). Op-set = **UPDATE-merge / NOOP** (on ne ADD/DELETE pas une colonne fixe).
- **Forme "collection" — des faits qui s'accumulent et disparaissent, une ligne par fait.** Ex : `mastery` par concept, `observation` (optionnel). Op-set = **ADD / UPDATE / DELETE / NOOP** complet.

### 4.2 Pattern transversal : table d'état courant **+** table d'historique
Pour **chaque entité mutable** par un nœud LLM : une table **état courant** (le read-model, lu à chaque séance, O(1)) **+** une table **`*_history`** append-only (audit/rollback, jamais dans le hot path). L'applier écrit l'état courant **et** append à l'history dans **la même transaction**, **en code applier — pas par trigger DB** (décision 12/06). L'history = un **log append-only d'opérations** : une ligne par op appliquée = snapshot **résultant** + provenance + `version` + `recorded_at` (voir §4.6). Le LLM ne lit **que** l'état courant.

> ❌ Ne PAS faire de l'history-only avec reconsolidation à la lecture : ça force un fold sur N lignes + une reconsolidation **non-déterministe** par le LLM à chaque lecture = on perd le "compounding par distillation". L'état consolidé doit être **matérialisé**.

### 4.3 Entités & schéma (Postgres ; esquisse à affiner à l'init)

> **IDs (décision 12/06) :** tous les `id` et FK = **uuid natif Postgres** (`@db.Uuid`, `@default(uuid(7))` — ordonné dans le temps pour la localité d'index). Pas de texte libre, pas d'auto-incrément (l'applier doit pouvoir générer/référencer un id avant insert).

```sql
student(id, display_name, grade_level, age, created_at)
-- Identité STATIQUE (pas le profil évolutif) : display_name=prénom (l'adresser) ;
-- grade_level/age = calibrer langage/difficulté/précision attendue. Consommé par socratic, ingest_parse, judge.

-- LEÇON : blob non structuré + métadonnées légères
lesson(id, subject, title, content_md TEXT, metadata JSONB, created_at, updated_at)
-- ⏳ `status` RETIRÉ de l'étape 1 (décision 12/06) → réintroduit avec l'ingestion : le cycle de vie
--    {draft, confirmed, revised} est sous-spécifié tant que le flow optimiste §5.2 n'existe pas (pas de transition
--    draft→confirmed définie). `revise` ne s'en sert pas. À définir contre le vrai flow.
lesson_source_image(id, lesson_id FK, path, ordinal)   -- ⏳ différé à l'ingestion
-- images sources persistées (volume local, ordre préservé). Permet : correction=re-ingest sans re-photographier,
-- debug de la qualité d'extraction, et REPLAY déterministe pour l'éval (pilier B).

-- CONCEPT : unité enseignable, extraite à l'ingestion. = le "dénominateur" d'une leçon.
concept(id, lesson_id FK, label, precision_bar, precision_note, created_at)
-- precision_bar = barre de maîtrise attendue. Enum {exact, intermediate, global} + precision_note (texte libre,
--   optionnel). PAS de champ `kind` (taxonomie subject-specific = prématuré, ne généralise pas en enum à travers
--   histoire/sciences/maths ; precision_bar porte la charge actionnable).

-- MAÎTRISE : overlay par (élève, concept). FORME COLLECTION.
mastery(student_id FK, concept_id FK, level, rationale TEXT, version,
        changed_by, run_id, is_locked, valid_from)  -- PK(student_id, concept_id)
-- level = enum {emerging, developing, secure} (décision 12/06) ; is_locked défaut FALSE (mastery = donnée).
mastery_history(... colonnes snapshot + op, reason, recorded_at)  -- append-only event log (PAS de valid_to)

-- PROFIL GLOBAL ÉLÈVE : contrat de propriétés PÉDAGOGIQUES (pas l'identité, qui est sur `student`).
-- FORME ÉTAT (colonnes typées TEXT, contenu free-text). Principe : une propriété mérite sa colonne
-- SEULEMENT si un flow la consomme pour changer un comportement (sinon = déco ; cf. piège lot 1 : "notes diverses" jamais lues).
-- Les 3 dimensions ci-dessous sont toutes INJECTÉES DANS LE SYSTEM PROMPT DU NŒUD SOCRATIQUE (guidance)
-- et AFFINÉES par le nœud d'analyse de séance (UPDATE-merge / NOOP, silence≠contradiction).
student_profile(student_id FK PK,
  learning_style    TEXT,   -- format/rythme/modalités qui marchent (ex: "questions courtes, une à la fois ; brèves OK ; exemples concrets") → comment questionner
  motivation_levers TEXT,   -- ce qui l'encourage (ex: "félicitations enthousiastes sur une série de bonnes réponses")       → ton de renforcement
  friction_to_avoid TEXT,   -- déclencheurs de décrochage à éviter (ex: "trop de questions d'affilée ; longues lectures ; se sentir jugée") → garde-fous
  is_locked, version, changed_by, run_id, updated_at)
-- is_locked défaut TRUE (mémoire procédurale qui pilote le tuteur ; n'écrit que sur op `force` explicite et loggée).
student_profile_history(... colonnes snapshot + op, reason, recorded_at)   -- append-only event log
-- Colonnes typées (pas EAV, pas JSONB) : la DB enforce présence + contrat code zod ↔ DB 1:1.
-- Démarrent VIDES ("à apprendre"), se remplissent au fil des séances (= le compounding). Évolution du contrat = migration propre (rare).
-- ❌ Pas de champ "notes diverses"/placeholder sans consommateur.

-- TRACE DE SÉANCE : épisodique, append-only, lien fort élève+leçon. Écrite en incrémental (§4.6).
session_trace(id, student_id FK, lesson_id FK, started_at, ended_at, transcript JSONB, summary TEXT, extraction JSONB)

-- OBSERVATION (optionnel, si on veut des faits fins type "confond X avec Y") : FORME COLLECTION.
-- observation(id, student_id, concept_id, fact TEXT, version, changed_by, run_id, valid_from) + history
```

### 4.4 Concept & maîtrise — granularité et "inconnu"
- La **maîtrise est par concept**, pas par leçon (une leçon a plein de concepts, avec des barres de précision différentes : dates = exact, concept vague = global, définition = entre-deux).
- `concept` (le dénominateur) est créé **à l'ingestion**. `mastery` (l'overlay) est inséré **paresseusement, à la première évaluation d'un concept = l'op ADD.**
- **"Inconnu" = un concept sans ligne `mastery` courante.** Récupéré par anti-join trivial :
  ```sql
  SELECT c.* FROM concept c
  LEFT JOIN mastery m ON m.concept_id = c.id AND m.student_id = :id
  WHERE m.concept_id IS NULL;   -- concepts jamais évalués (maîtrise inconnue)
  ```
- Donc **on n'insère PAS une ligne par concept dès la première révision** — seulement les concepts évalués. L'absence signifie "inconnu" sans ambiguïté car `concept` est le dénominateur canonique. (Pré-seeder des lignes `not_assessed` explicites ne vaut le coup que si on veut un jour attacher de la métadonnée à l'état inconnu — pas maintenant.)

### 4.5 Politique d'écriture (le vrai risque, pas le rollback)
**L'overwrite aveugle est le tueur silencieux.** Exemple : séance 1 → `mastery.revolution = "comprend causes, confond dates"`. Séance 5 (les dates pas évoquées) → un overwrite produirait `"maîtrise les causes"` et **effacerait** la nuance dates — pas parce que l'élève a progressé, mais parce que l'extracteur ne l'a pas *observée*. **L'absence de preuve devient preuve d'absence.**

Règles :
- Le nœud d'extraction émet une **liste d'opérations** (sortie structurée zod) `{op, cible, nouvelle_valeur, raison}`, op ∈ **ADD / UPDATE / DELETE / NOOP**. Un **applier déterministe** les exécute.
- **UPDATE merge, ne remplace pas.** **DELETE uniquement sur contradiction explicite.** **Silence ≠ contradiction** : un fait non ré-observé cette séance = NOOP, jamais DELETE.
- **Forme état** (`student_profile`) → l'op-set se réduit en pratique à **UPDATE-merge / NOOP** par champ.
- **Forme collection** (`mastery`, `observation`) → op-set complet (ADD = 1re évaluation, UPDATE = affiner, DELETE = concept retiré/contredit).
- `zod` garantit la **forme**, pas la **vérité** du texte. Validation verte ≠ contenu correct.
- **Verrou par défaut (`is_locked`)** sur les champs qui *pilotent le comportement* du tuteur (mémoire "procédurale", écriture plus risquée) : ils ne changent que sur opération explicite et loggée (flag `force`).
- **Structure de l'applier (functional core / imperative shell, décision 12/06)** : une **décision PURE** `decideMasteryAction(état_courant, op) → action` porte toute la politique (merge par champ, NOOP, garde `is_locked`/`force`, add↔update normalisé selon présence) — testée **sans DB**, exhaustivement. Une **coquille transactionnelle** lit l'état, appelle la décision, puis écrit état courant **+** ligne d'history. Le `merge` est **par champ** : un champ non fourni par l'op (`undefined`) est **gardé** ; `null` explicite efface (c'est l'enforcement déterministe de "silence ≠ contradiction"). `version` monotone calculée depuis le max history (robuste au delete/re-add).

### 4.6 Audit / visibilité / rollback
- Chaque op appliquée écrit une ligne d'history = **snapshot RÉSULTANT (l'état après l'op)** + **provenance** : `op, raison, changed_by (nom du nœud), run_id (thread/run LangGraph), version, recorded_at`. **Pas de stockage `ancienne_valeur`+`nouvelle_valeur`** (décision 12/06) : la valeur d'avant = la version N-1 de la timeline, on ne duplique pas.
- **Visibilité** = lire la timeline d'une cible (`SELECT … FROM *_history WHERE … ORDER BY version`) : quoi, quand, par quel nœud.
- **Rollback** = lire la version N → la **rejouer comme une nouvelle op** (via l'applier, `force: true`). Se logge à son tour (nouvelle version), rien n'est détruit.
- ⏳ **Visibilité + rollback différés à l'étape 4** (profondeur du moat, décision 12/06) : la **donnée versionnée est déjà en place** (l'applier écrit l'history à chaque op) ; il ne reste qu'à câbler la lecture de timeline et la fonction de restauration (un read + un replay) — elles **réutilisent l'applier**, aucune logique de mutation nouvelle.
- Visibilité et rollback = **le même mécanisme** (le journal d'opérations EST la piste d'audit). Défense en profondeur : la politique d'écriture *réduit* les mauvaises écritures, l'history *rattrape* celles qui passent.
- ⚠️ **Le checkpointer LangGraph ≠ rollback de mémoire domaine.** Il versionne l'**état d'exécution du graphe par `thread_id`** (rewind d'une conversation). Tes tables d'history versionnent le **modèle élève**. Deux axes différents — ne pas confondre.

### 4.7 Distillation incrémentale (robuste au quit brutal)
- **Unité de distillation = par concept évalué, PAS "fin de séance"** (une enfant ferme l'app brutalement). Le nœud d'update mémoire vit **dans la boucle socratique** (§5.3), pas en nœud terminal.
- Chaque update incrémental est **idempotent et indépendant** : quit après Q4 → 4 concepts à jour, le 5e reste inconnu. Cohérent, jamais à moitié corrompu.
- `session_trace` écrite **en incrémental** (append des échanges / résumé courant).
- Une synthèse de fin de séance plus riche = **nice-to-have si la séance va au bout** ; la mémoire durable n'en dépend **jamais**.
- Coût : plus d'appels → instrumenter (pilier C). Correctness > coût pour le POC.

### 4.8 Hydratation du nœud socratique (là où vient la compétence)
La qualité du tuteur dépend surtout de **ce qu'on injecte dans le nœud socratique**, pas d'un prompt malin. Hydrater le contexte du nœud avec : le **contenu de la leçon**, la **`precision_bar` du concept en cours**, la **maîtrise courante** de l'élève sur ce concept et les concepts liés, l'état d'inconnu (concepts non évalués), et le dialogue en cours. Tout le modèle mémoire existe pour nourrir ce nœud.

---

## 5. Flows = un router workflow sur des sous-graphes par intent

**Pattern canonique : "router workflow over intent subgraphs"** (déterministe), *pas* le "supervisor" LLM-orchestré. Réfs : LangGraph *Thinking in LangGraph*, *use-subgraphs*, *graph-api*, *interrupts*, *persistence* ; LangChain *How to think about agent frameworks*.

### 5.0 MVP = 3 intents + un garde-fou
Enum **fermé** d'intents : `["ingest", "revise", "qa", "out_of_scope"]`.
- **`out_of_scope` dès le début** (quasi gratuit, structurel) : un nœud renvoie une redirection fixe ("je t'aide à réviser tes leçons, on reprend ?"). C'est la muraille anti-ChatGPT-générique.
- Intent **curiosité ouverte cadrée leçon** = différé (itération future).

### 5.1 Router (graphe parent)
`classify` (LLM, **output structuré** `z.enum`, le seul intelligence du router) → **arête conditionnelle déterministe** (code pur) → sous-graphe. Le LLM remplit `state.intent` ; le code décide.

```ts
const IntentSchema = z.object({ intent: z.enum(["ingest","revise","qa","out_of_scope"]) });
// nœud classify : getModel("classifier").withStructuredOutput(IntentSchema)
function routeOnIntent(s){ switch(s.intent){ case "ingest": return "ingestSG";
  case "revise": return "reviseSG"; case "qa": return "qaSG"; default: return "outOfScope"; } }
parent.addConditionalEdges("classify", routeOnIntent, { ingestSG:"ingestSG", reviseSG:"reviseSG", qaSG:"qaSG", outOfScope:"outOfScope" });
```
- **État parent sur `MessagesAnnotation`** (transcript partagé) + clés propres : `intent`, `activeLessonId`/`lastIngestedLessonId`, `socraticStep`, `pendingIngestion`. ⚠️ `messages` a besoin du **reducer d'append** (fourni par `MessagesAnnotation`) — sinon chaque nœud qui renvoie `{messages:[…]}` **écrase** l'historique. Les scalaires (`intent`…) prennent le reducer par défaut (remplace), ce qui est correct.
- **Classifier différable** : avec un seul intent câblé tu n'as même pas besoin du classifier ; mais le MVP a 3 intents → on le construit. Confiance basse du classifier → router vers un petit nœud **`clarify`** (pose une question) plutôt que deviner. Flow-switch cheap = un mauvais branchement se rattrape au tour suivant.
- **Saut de `classify` quand un flow est en cours (décision 13/06)** : une arête conditionnelle au START lit l'état (un flow `revise` actif ?) ; si oui, le tour **bypasse `classify`** et route directement vers le sous-graphe pour traiter la réponse de l'élève (cf. §5.3 : run-to-END). Sinon `classify`. Sans ce garde, le « 1789 » de l'enfant serait re-classifié comme un nouvel intent à chaque tour. *(C'est l'analogue, côté dialogue normal, du guard resume-vs-message du §6 — qui, lui, reste pour le HIL de l'étape 3.)*

### 5.2 Sous-graphe `ingest` — **optimiste, non-bloquant**
```
images → [LLM vision, structuré] parse leçon + extrait concepts → [déterministe] écrit lesson(status='draft') + concepts (UPSERT idempotent) → [LLM] récap prose ("voici ce que j'ai compris, dis-moi si ça cloche")
```
- **Persiste proactivement** (draft), **ne fait PAS attendre la validation explicite.** Le récap est un simple tour assistant (tokens) ; l'enfant peut ignorer et enchaîner. Le feedback éventuel = un flow qui *modifie* de la donnée existante (cf. §14 : **MVP = ré-ingestion/replace**, pas d'édition chirurgicale).
- `interrupt()` **réservé aux gates durs** (cas dangereux, ex : écraser une leçon existante) — voir §5.5.
- Time-box l'ingestion : ne doit pas devenir le projet. **Pour démarrer le build, seed les fixtures à la main** (l'ingestion conversationnelle complète vient après le cœur Réviser — voir §12).

**Spécificités "images" (décisions 09/06) :**
- **Modèle vision** : `ingest_parse` = modèle multimodal (contrainte factory §2).
- **Transport** : images arrivent par `/api/chat` en **file parts AI SDK v6** → `toBaseMessages` → `HumanMessage` multimodal LangChain. ⚠️ Vérifier le mapping exact image-part → bloc image à l'init.
- **Input = `image[]`** (leçon multi-pages), **ordre préservé** (`lesson_source_image.ordinal`).
- **Persistance des sources** : stocker les images (volume local, chemin dans `lesson_source_image`). Raisons : correction=re-ingest, debug d'extraction, **replay déterministe pour l'éval**. (Alternative légère v1 : jeter + re-photographier — mais persister est cheap et tu voudras debugger l'extraction.)
- **Extraction** : un appel vision + structured output (leçon + concepts). Si peu fiable, splitter **transcrire → structurer**. Le **LLM-judge "light"** de sanity-check (leçon cohérente ? concepts non vides ?) gagne sa place ici (extraction image = faillible).
- **Latence → progression** : la vision est lente → émettre un **data part de progression** ("j'analyse tes images…"). = premier vrai usage d'un signal non-prose (§7).
- **Coût (pilier C)** : ingestion image = hotspot de coût (tokens image) → instrumenter.
- **Faillibilité → le récap optimiste EST le filet** : l'extraction se trompe (date mal lue, section ratée) → "voici ce que j'ai compris" + correction par ré-ingestion = le mécanisme de sûreté central, pas un détail.
- **Privacy** (hors scope POC, à noter) : photos du travail scolaire d'une enfant → API LLM tierce. À garder en tête pour toute productionisation future.

### 5.3 Sous-graphe `revise` — **le cœur** (le seul vrai nœud agent)
```
[déterministe] hydrate mémoire (contenu leçon + concepts + maîtrise courante + inconnus) →
BOUCLE EXTERNE DÉTERMINISTE sur les concepts de la leçon :
   ┌─ dialogue socratique interne (nœud agent, BORNÉ) : [LLM socratic] ↔ réponse élève  (STREAME token/token)
   │     • le LLM émet un "signal de maîtrise" structuré → code déterministe décide : concept maîtrisé / passe au suivant / max N tours atteint
   └─ [déterministe] À LA RÉSOLUTION DU CONCEPT → update mémoire incrémental (applier ADD/UPDATE/DELETE/NOOP) + append session_trace
```
- **Altitude** : boucle externe déterministe (quel concept), dialogue interne agentique (comment questionner). La **conversation reste ouverte** (c'est la pédagogie — ne pas la scripter) ; ce qui l'entoure est déterministe.
- **Borner la boucle interne** (max tours + sortie sur signal structuré) empêche le nœud agent de tourner à l'infini *et* alimente la distillation incrémentale (§4.6).
- La qualité socratique (ton, ne pas donner la réponse, adaptativité) se **tune contre de vraies séances**, pas sur le papier. Assez bon pour démarrer ; itérer empiriquement.

> **Réalisation concrète (décision 13/06, étape 2) — la « boucle » est une machine à états portée par le checkpoint, PAS un `while` intra-nœud.** Vérifié contre les bonnes pratiques de l'écosystème : le pattern canonique d'un chatbot multi-tours est **run-to-END + re-invoke par message** (arête vers `END` à chaque tour, même `thread_id`, le checkpointer recharge l'état) ; `interrupt()` est idiomatique pour le **HIL *au sein d'un run*** (gate d'approbation), pas pour la frontière naturelle entre deux tours. Donc `interrupt()` reste **réservé au gate dur (étape 3)** ; le dialogue normal ne s'en sert jamais.
> - **Un POST = un tour de dialogue.** `socratic.ask` est le dernier nœud du tour : il **streame** une question/relance puis le graphe atteint `END`. Le tour suivant ré-entre par le router (cf. §5.1 : un flow `revise` actif **saute `classify`** et va directement traiter la réponse).
> - **Deux nœuds LLM distincts, pas un** : `socratic` (prose ouverte, streamée) et `evaluate` (sortie **structurée** zod = *signal de maîtrise*, modèle cheap, **non streamé**). Sépare proprement l'altitude (agentique ouvert vs raisonnement cadré) et n'entrave pas le streaming.
> - **Écriture mémoire GATED, pas systématique** : `evaluate` renvoie un statut `continue | resolved` ; `decide` (déterministe) tranche. `applyMasteryOps` + append `session_trace` ne se déclenchent **que** sur `resolved` (ou résolution forcée à `MAX_TURNS`, garde-fou anti-boucle). Un simple `continue` = **aucune écriture**. C'est l'enforcement de la distillation « par concept évalué » (§4.7) : on n'écrit que quand l'agent juge le concept *traité*, pas après chaque interaction.
> - **Plusieurs allers-retours par concept** sont le mode normal (élève qui galère, réponse partielle à creuser) → la boucle interne n'est pas bornée à 1 tour ; `MAX_TURNS` n'est qu'un plafond de sûreté.
> - **Le *signal de maîtrise* est un schéma NOUVEAU interne à `revise`** (`{ status, level?, rationale? }`), **distinct de `MasteryOpSchema`** (§4) : on ne mappe vers une `MasteryOp` qu'à la résolution → churn minimal sur les contrats de surface de l'étape 1.
> - **`session_trace`** : l'API mémoire de l'étape 1 ne couvre pas l'écriture du trace → un petit helper d'append (incrémental, §4.6) est ajouté dans `memory/`.

> **Politique de sélection des concepts (décision 13/06) — déterministe, pilotée par les lacunes + récence.** `hydrate` ne déverse pas tous les concepts au socratique ; un sélecteur déterministe construit une file priorisée :
> - **Tier 1 — inconnu** : concept sans ligne `mastery` (anti-join §4.4). Toujours éligible.
> - **Tier 2 — faible** : `level ∈ {emerging, developing}`. Toujours éligible (encore en apprentissage).
> - **Tier 3 — acquis périmé** : `level = secure` **et** non revu depuis longtemps (répétition espacée). ⏳ **différé à une slice dédiée post-cœur** (cf. §15, slice 2.7).
> - **Borne par séance** : on plafonne le nombre de concepts traités, le reste est reporté → compounding. La borne est **configurable** (par matière / évolutive), **pas codée en dur**.
> - **Ordre** : lacunes d'abord (tier 1 puis 2), ordre de leçon en départage. `precision_bar` calibre la sévérité du « résolu » côté `evaluate`, **pas** l'ordre.
>
> **Temporalité — comment un concept “acquis” redevient à réviser (décision 13/06, post-cœur, profondeur = récence + intervalle par niveau).** Il n'y a **aucun statut “périmé” stocké, aucun cron** : l'éligibilité est **dérivée à la lecture** (au moment de bâtir la séance), exactement comme « inconnu = absence de ligne ». Un concept secure est périmé si `now() − last_reviewed_at ≥ intervalle(level)` (intervalle par niveau : un secure se revoit moins souvent qu'un developing). **Un statut matérialisé serait faux entre deux runs** (il dépend de l'horloge) → on compare toujours à `now()` à la sélection. La seule donnée **écrite** est `mastery.last_reviewed_at` (**nouvelle colonne**), **bumpée à chaque révision aboutie même si le niveau ne change pas** — découplé du `NOOP` “no change” de la policy d'état ([mastery-policy.ts](apps/backend/src/memory/mastery-policy.ts)), qui garde l'history d'audit propre (deux préoccupations : *changement d'état* vs *touche de révision*). `next_due` reste **dérivé** (`last_reviewed_at + intervalle(level)`), pas stocké. ⚠️ C'est une **extension** de la mémoire, justifiée par le brief (§4 : on étend quand un consommateur réel le réclame — ici la sélection) ; pas du SM-2 complet (pas d'ease factor), la colonne laisse la place d'y aller plus tard. **→ Implémenté en 2.7 (décision 15/06) comme un système de Leitner** : au lieu d'un intervalle fixe par niveau, une **échelle de paliers croissants** `[1,2,4,8]` jours (env-configurable) indexée par une 2e colonne `mastery.review_step` ; une ré-révision d'un concept resté `secure` **grimpe d'un cran** (intervalle suivant plus long), retomber sous secure remet à 0. `emerging`/`developing` ne sont **pas** espacés (toujours éligibles). Détail en §16 (2.7).

### 5.4 Sous-graphe `qa` — léger
Q&A cadrée sur une leçon (notions importantes, niveau de maîtrise). Essentiellement un appel LLM sur leçon + mémoire (le "niveau de maîtrise" est même une simple lecture de `mastery`). Pas la boucle lourde du socratique.

### 5.5 HIL — gate dur (réservé), modalité 2 étages
Quand (et seulement quand) une action est dangereuse/irréversible (ex : overwrite d'une leçon existante) :
```ts
const decision = interrupt({ kind:"confirm_overwrite", lessonId, parsed, options:["replace","keep_both","cancel"] });
```
- **Le payload d'interrupt = le contrat back↔front** : son `kind` dit au front quel composant rendre. Surfacé comme **data part custom** dans le stream (`{ type:"data-confirm", … }`).
- **Modalité à 2 étages** : (1) back = graphe en pause (checkpointer), ne peut avancer sans resume ; (2) front = `ConfirmCard` rendue + **input texte désactivé**.
- ⚠️ **Re-run au resume** : au `Command({resume})`, **le nœud re-tourne depuis le haut** ; seul `interrupt()` renvoie la valeur reprise. → tout side-effect avant l'`interrupt()` doit être **idempotent (upsert)** ou placé *après*. **Ne jamais wrapper `interrupt()` dans un try/catch** (il fonctionne en levant une exception spéciale). Plusieurs interrupts dans un nœud = matchés par **index** → ordre fixe, inconditionnel.
- Voir §6 pour le guard **resume-vs-new-message** côté handler.

---

## 6. Contrat API (front ↔ back) — **un seul endpoint**

Un seul `/api/chat`. **Plus de `/api/ingest`, `/api/ingest/validate`, `/api/student/:lessonId`** — tout passe par le chat (ingestion, révision, Q&A, validation HIL).

| Route | Méthode | Rôle | Réponse |
|---|---|---|---|
| `/api/chat` | POST | un tour conversationnel (intent détecté & routé en interne) | **stream UIMessageStream** (SSE) |

- Handler **stateless**, chaque requête porte `thread_id`. Reçoit les messages, convertit via `toBaseMessages`, **reprend le graphe parent** par `thread_id`, streame (§7).
- ⚠️ **Guard resume-vs-new-message** : en tête du handler, vérifier l'état d'interrupt (`graph.getState(config)` → `.tasks[].interrupts` / `.next`). Si le thread est **interrompu**, le POST suivant doit devenir un `graph.stream(new Command({ resume: … }), …)`, **pas** un nouveau `HumanMessage`. Sinon le "oui" de l'enfant est re-classifié comme un nouvel intent. Le front marque explicitement un envoi "resume" (cf. §8).
- **Résolution de leçon** (pour "fais-moi réviser la leçon 13") : un resolver déterministe mappe une référence → `lesson.id` (par titre/numéro), alimente `activeLessonId` dans l'état. **Étape 2 (décision 13/06) — JAMAIS de choix implicite** : `classify` capture un **indice de leçon optionnel** (n° de thème / titre) ; le resolver calcule un **ensemble de candidats** depuis la base (mapping sur `lesson.metadata.theme` / titre des fixtures), puis :
  - **exactement 1 candidat** (l'indice matche une leçon, *ou* il n'existe qu'une seule leçon) → on résout et on enchaîne. Ce n'est pas un pari : c'est sans ambiguïté.
  - **0 candidat** (réf. introuvable, ex. « la 13 » alors que seules 11 & 12 existent) → nœud **`clarify`** : *« je n'ai pas cette leçon ; voici ce que j'ai… »*.
  - **>1 candidat** (aucun indice avec plusieurs leçons, ou indice vague) → **`clarify`** : *« tu veux réviser laquelle ? j'ai… »* (liste **lue dans la DB** : titre + thème ; message déterministe, le LLM ne devine pas).
  - **base vide** (rien d'ingéré) → message qui oriente vers l'ajout de leçon (intent `ingest`, étape 3).
  - ❌ **Pas de « leçon par défaut » silencieuse.** Le seul défaut légitime = le cas *1 candidat unique*.
  - **Tour suivant après `clarify`** : un flag d'état `pendingLessonChoice` fait **sauter `classify`** et renvoie la réponse (« la 12 ») directement au resolver (même garde que §5.1), pour éviter qu'une réponse courte soit mal classifiée.

---

## 7. Design du streaming

- **SSE via UIMessageStream sur HTTP simple. Pas de WebSocket** (interaction = requête → réponse streamée, en tours). Documenter ce choix (jugement pilier D).
- **Stream hétérogène → démuxer par type** (le côté producteur du rendu parts-based §8) :
  - **Texte** (nœud socratique, récap d'ingestion en prose) = **tokens**, `streamMode:["messages"]`.
  - **Signaux non-prose** (carte de confirmation HIL, progression, futur aperçu structuré) = **data parts**, `streamMode:["messages","custom"]` + writer.
  - Le nœud `classify` n'est pas streamé à l'UI (interne).
- En **v1 texte-seul**, la sortie user-facing de l'ingestion (le récap) = des tokens, comme le socratique. Les data parts n'arrivent qu'avec les signaux non-prose (à commencer par le `data-confirm` du HIL).

```ts
// version basique (texte) :
const stream = graph.stream(input, { streamMode:["messages"], configurable:{ thread_id } });
return createUIMessageStreamResponse({ stream: toUIMessageStream(stream) });

// dès qu'on émet des data-* (HIL, etc.) — additif, pas une refonte :
const stream = createUIMessageStream({ execute: async ({ writer }) => {
  writer.merge(toUIMessageStream(graph.stream(input, { streamMode:["messages","custom"], configurable:{ thread_id } })));
  // l'interrupt remonté est émis en { type:"data-confirm", id, data } (voir §5.5)
}});
return createUIMessageStreamResponse({ stream });
```

- ⚠️ **Seam Fastify** : `createUIMessageStreamResponse` renvoie un **Web `Response`** ; piper son `ReadableStream` dans la `reply` Fastify (`Readable.fromWeb()`), headers `text/event-stream`, **désactiver toute compression qui re-bufferise**.
- ⚠️ **Rendu de l'interrupt en UI non documenté** par l'adaptateur AI SDK → prévoir du glue (émettre un `data-*` part, le rendre côté client). Pas turnkey.

---

## 8. Frontend

- `useChat<TutorUIMessage>` **typé** (le `UIMessage` custom centralise les data parts — voir §8.1).
- **Rendu parts-based dès le jour 1** :

```tsx
{message.parts.map((part) => {
  switch (part.type) {
    case "text": return <Bubble role={message.role}>{part.text}</Bubble>;
    case "data-confirm": return <ConfirmCard data={part.data} onChoice={sendResume} />; // HIL gate dur
    // case "data-exercise": …  // ← itération future, additif
    default: return null;
  }
})}
```

- **UX threads (décision 09/06)** : **pas d'historique de discussions type ChatGPT.** Lancement de l'app → **nouveau thread**. Kill + réouverture → **nouveau thread**, pas d'accès aux anciens, pas de "rejump". La continuité vient de la **mémoire durable** (DB), pas du log de chat. Bénéfices : UX triviale pour une enfant + contexte borné (on hydrate la mémoire pertinente dans un thread frais).
- **HIL** : sur réception d'un `data-confirm`, rendre la `ConfirmCard` + **désactiver l'input**. Le bouton envoie un **resume** (pas un message normal). Au reload pendant un interrupt, re-détecter l'état (`graph.getState`) et re-render la carte.
- **Panneau "modèle élève"** = **optionnel** pour le MVP (l'endpoint `/api/student` a été supprimé). Si désiré, l'alimenter via un **data part** émis dans le stream, sinon différer. Garder le rendu parts-based prêt.
- Store d'état léger (Zustand) minimal — prêt à devenir le hub si une UI partagée arrive, **non sollicité pour l'instant**.

### 8.1 Type central des messages (point d'évolution)
```ts
// packages/shared
export type TutorUIMessage = UIMessage<NoMetadata, {
  confirm: { kind: string; /* payload d'interrupt */ };   // HIL
  // ajouter ici les data parts futures (exercise, mascot…) → typage centralisé
}>;
```

---

## 9. État / statefulness

**Verdict : handlers HTTP stateless ; état externalisé. Working memory (jetable) ≠ long-term memory (durable).**

- **Handlers Fastify = stateless** : chaque requête self-contained, identifiée par `thread_id`. Aucune affinité mémoire.
- **Checkpointer LangGraph (`PostgresSaver`)** = **working memory** : état conversation/graphe par `thread_id` (messages du tour, position, état d'`interrupt`). **Sur le graphe parent uniquement** (se propage aux sous-graphes ; le passer à un sous-graphe est silencieusement ignoré). `thread_id` ≠ PK de leçon.
- **DB Postgres (modèle élève + leçons + concepts + maîtrise)** = **long-term memory** durable, traverse les threads.
- **Thread jetable** : nouveau `thread_id` à chaque lancement d'app (cf. §8). On ne resume pas automatiquement les threads interrompus ; les threads orphelins restent inertes (GC périodique). Orphelin ≠ corrompu.
- **Quit pendant un interrupt = sûr par construction** : en cas succès la donnée est écrite *avant* tout interrupt (draft cohérent) ; l'interrupt gate dur ne mute le dangereux qu'*après* résolution → si l'enfant quitte, la mutation dangereuse n'a simplement jamais lieu. **Règle** : faire de chaque frontière d'interrupt un **point de pause sûr** (rien d'irréversible à moitié fait à cheval). Drafts non confirmés = cohérents (utilisables ou GC).
- **Jamais de mémoire durable conditionnée à un exit propre** → distillation incrémentale (§4.6).

---

## 10. Observabilité + coût (étape ultérieure — pilier C)

OpenTelemetry → **Langfuse** (obs + eval + coût en un outil). **Coût/séance câblé à la main via le SDK.** ⚠️ Si un nœud = harness d'agent complet, le coût/obs ne remonte pas tout seul → instrumenter à la main. La **distillation incrémentale** (plus d'appels) et la **factory par-rôle** (coût par modèle/rôle) sont les angles coût à montrer. **Scaffolder mais câbler après que les flows cœur tournent.**

## 11. Eval (étape ultérieure — pilier B)

Méthode : **d'abord produire du structuré** (feuille Q/R + signaux de maîtrise parsables), *puis* 2 LLM-as-judge : (1) factuel (ex : "1789" pour la Révolution), (2) socratique (n'a pas donné la réponse). La `precision_bar` du concept calibre le juge factuel. 10-20 cas. Via Langfuse. Leçon d'ingénierie : **l'eval force le structured output.** Les tables `*_history` fournissent gratuitement un dataset de debug/éval.

---

## 12. Séquence de build (l'ordre à suivre)

0. ✅ **[FAIT]** **Scaffold** monorepo (pnpm + Turbo, `docker-compose` avec Postgres, package `shared`, Fastify `/api/chat` stub). ⚠️ Restent à faire au moment du build cœur : factory modèle par-rôle, graphe parent + sous-graphes, vérif API AI SDK v6 (§2) — pas encore câblés (le `/api/chat` actuel ne fait que logger + renvoyer un stub).
1. ✅ **[FAIT]** **Schéma mémoire DB** (tables état + history, concept/mastery/student_profile/session_trace) + **appliers déterministes** + repos de lecture/hydratation + fixtures seedées. **API disponible dans `apps/backend/src/memory/`** : `hydrateForRevision(studentId, lessonId)` (bundle socratique §4.8), `applyMasteryOps(meta, ops[])` (forme collection), `applyProfileOp(meta, op)` (forme état) ; contrats zod `MasteryOpSchema`/`ProfileOpSchema` (`memory/ops.ts`) ; `meta = { studentId, changedBy, runId? }`. 43 tests verts.
2. **Tranche verticale `revise`** (le cœur / le skill nommable) : router → sous-graphe revise (boucle externe concepts + dialogue socratique borné + signal de maîtrise) + **update mémoire incrémental déterministe** + streaming tokens, bout-en-bout depuis le client React. Sur fixtures seedées. ⚠️ Les **contrats de surface mémoire de l'étape 1 sont provisoires** — les ajuster ici si le vrai nœud socratique / signal de maîtrise le réclame (cf. §4, callout « Stabilité du modèle mémoire » : ce qui est figé vs ce qui peut flexer).
3. **Ingestion conversationnelle** (optimiste, draft + récap) + **HIL gate dur** (interrupt → data-confirm + guard resume) + intent `qa`. (L'ingestion n'est plus le "warm-up trivial" — elle a le HIL ; c'est pour ça qu'elle vient après le cœur.)
4. **Approfondir le moat** : eval (B) + observabilité/coût (C) + **visibilité/rollback mémoire** (timeline d'history + restauration par replay via l'applier — la donnée versionnée est déjà là dès l'étape 1). Profondeur, pas largeur.
5. **Durcir + writeup + conteneuriser** : docker compose propre, code propre, **writeup technique** (altitude par nœud, workflow-vs-agent/router, **design mémoire : 2 formes, politique d'écriture, audit/rollback, working vs long-term**) = artefact public obligatoire.

**Stretch (seulement si core fini tôt)** : édition chirurgicale de leçon ; intent curiosité ouverte cadrée ; boucle d'auto-amélioration du skill ; OpenCode + DeepSeek pour le coût ; eval élargie ; garde-fous drift/poisoning. **Pas avant.**

---

## 13. Définition de "shipped" (le ship du cycle = lot 2, coupe 17/06)

Sur **2-3 séances réelles** via l'app React (un seul chat) :
1. **Router workflow déterministe** (classify → sous-graphes) ; cœur `revise` bout-en-bout ; **mémoire DB modélisée** (concept/mastery, 2 formes) ; **update = applier déterministe** ADD/UPDATE/DELETE/NOOP avec history/provenance.
2. **Distillation incrémentale** démontrable (mémoire à jour même sans fin de séance propre).
3. Observabilité + coût/séance câblés (Langfuse/OTel) : un chiffre + des traces.
4. **Une** eval LLM-as-judge (factuel + socratique).
5. Writeup technique (altitude par nœud + design mémoire + working-vs-long-term + politique d'écriture/rollback).
Le tout conteneurisé (docker compose : backend + Postgres), prêt-à-déployer (non déployé).

---

## 14. Non-goals explicites (ce cycle)

- ❌ Mascotte / UI centrale interactive → archi *compatible*, **non construite**.
- ❌ Composants UI custom par question → **itération future**, garder le rendu parts-based prêt.
- ❌ Hébergement / cloud / auth / multi-élève (docker compose local ≠ hébergement).
- ❌ Vector DB / RAG (corpus tient en contexte — le refus est un argument).
- ❌ **Modification chirurgicale / conversationnelle d'une leçon** (éditer un concept précis, dialogue "quoi changer / par quoi"). Ouvre une vraie complexité : résolution de référence ("la leçon 13" → quelle ligne), sous-spécification → dialogue de clarification, et surtout **ripple sur concepts/maîtrise** (éditer un concept casse les lignes `mastery` qui le référencent). **Correction MVP = ré-ingestion / replace** (réutilise le flow d'ingestion + le gate d'overwrite dur, donc aucune détection de "phase modification" à coder). Édition chirurgicale = itération future. *(décidé 09/06, tour de conception lot 2)*
- ❌ **Intent "curiosité ouverte cadrée leçon"** → différé (l'enum fermé + `out_of_scope` est en place pour l'accueillir).
- ❌ **Historique de threads / multi-thread UX** (type ChatGPT) → thread jetable, nouveau à chaque lancement (§8, §9).
- ❌ Pré-seeding de lignes `mastery` "not_assessed" → l'inconnu = absence de ligne (§4.4).
- ❌ Multi-agent orchestration. WebSocket. Resumable streams (sauf si trivial).

---

## 15. Hypothèses / décisions (corriger si besoin)

- **DB = PostgreSQL** (acté 09/06 ; local docker compose). Accès via **Prisma** (choisi 09/06 pour la familiarité ; ORM batteries-included). **History tables écrites en code applier (transaction), pas triggers.**
- **Provider LLM par défaut = Anthropic Claude**, via **factory par-rôle provider-agnostique** (swappable `@langchain/openai` etc.).
- **Node 20+**, **pnpm**.
- Tranche produit : **CM2 × Histoire**, plusieurs leçons (mais garder le modèle générique multi-matières : pas de `kind` subject-specific, `precision_bar` générique).
- AI SDK **v6** — API exacte à vérifier contre la version installée (§2).
- Repo de code = **nouveau repo séparé** (pas ce repo de recherche).

### Décisions actées 12/06 (build scaffold + étape 1 mémoire)
- **Prisma 7** (pas 6) : config via `prisma.config.ts` (datasource `url`), **driver adapter** `@prisma/adapter-pg`, générateur `prisma-client` → client TS dans `apps/backend/src/generated` (**gitignoré**, régénéré par `db:generate`/`db:migrate`). `@db.Uuid` + `@default(uuid(7))` sur tous les id/FK.
- **History = log append-only** : une ligne par op = snapshot **résultant** + provenance + `version` + `recorded_at`. **Pas** de `valid_to`/intervalles bitemporels (version + snapshot suffisent pour visibilité/rollback). Écrite **en code applier (transaction)**, pas par trigger.
- **Enums (côté Prisma, source unique ; pas dans `shared` tant que le front ne les affiche pas)** : `precision_bar {exact, intermediate, global}` + `precision_note` · `mastery.level {emerging, developing, secure}` · `MemoryOp {add, update, delete, noop}`.
- **`is_locked`** : défaut TRUE sur `student_profile` (mémoire procédurale), FALSE sur `mastery` ; surchargé par un flag `force` explicite et loggé.
- **Applier = functional core / imperative shell** : décision PURE testée sans DB + coquille transactionnelle (§4.5).
- **Différés à l'ingestion (étape 3)** : `lesson.status`, `lesson_source_image`, `observation`.
- **Rollback + visibilité différés à l'étape 4** (la donnée versionnée est déjà produite par l'applier dès l'étape 1) — §4.6.
- **Tests** : intégration sur base dédiée **`tuteur_test`** auto-provisionnée ; **vitest** en deux *projects* (`unit` sans DB / `integration` avec). Stratégie de test détaillée dans **CLAUDE.md**.
- **Front (hors design mémoire)** : Tailwind v4 + shadcn/ui, thème custom "Atelier" (tokens CSS). Le front reste un client mince jetable jusqu'au câblage `useChat`/streaming (étape 2).

### Décisions actées 13/06 (appliers — étape 1 finalisée)
- **Étape 1 terminée** (cf. §12.1 pour l'API du module `memory/`).
- **Transaction = par appel d'applier**, pas par op. Un appel = la conséquence mémoire d'UN évènement (une réponse de l'élève) → tout-ou-rien. L'indépendance §4.7 vient de la **granularité d'appel** (la boucle `revise` appellera une fois par concept résolu), **pas** d'un découpage en sous-transactions.
- **Contrainte d'unicité `(cible, version)`** sur les tables history (durcissement concurrence : une collision de version fait échouer la transaction au lieu de produire un doublon silencieux).
- **Profil = mémoire procédurale** : `is_locked` défaut TRUE, et **une ligne absente compte comme verrouillée** → **toute écriture, même la première, exige `force`**. ⚠️ **CONTRAT À DÉFINIR À L'ÉTAPE 2/3** : le verrou n'a de valeur que si le nœud `session_analysis` utilise `force` **sélectivement** (p. ex. conditionné à un seuil de confiance) ; sinon il est purement décoratif. Le verrou est aussi **dormant pour `mastery`** (défaut FALSE, aucune op ne le pose) — présent par symétrie.

### Décisions actées 13/06 (étape 2 — cadrage du flow `revise`)
- **Multi-tours = machine à états run-to-END** (graphe jusqu'à `END` à chaque tour, checkpointer + état parent portent la progression), **pas** une boucle `interrupt()` intra-nœud. Vérifié contre les bonnes pratiques LangGraph. `interrupt()` **reservé au HIL de l'étape 3**. Détail en §5.3 (callout) + §5.1 (saut de `classify`).
- **Deux nœuds LLM dans `revise`** : `socratic` (prose streamée, ouverte) + `evaluate` (signal de maîtrise **structuré** zod, modèle cheap). Le *signal* est un **schéma interne à `revise`** (`{ status: continue|resolved, level?, rationale? }`), distinct de `MasteryOpSchema` ; mappé vers une `MasteryOp` **seulement** à la résolution.
- **Écriture mémoire gated sur résolution de concept** (jamais après chaque interaction) : `applyMasteryOps` + append `session_trace` uniquement sur `resolved` (ou `MAX_TURNS` forcé). C'est l'enforcement de la distillation §4.7. **Plusieurs allers-retours par concept = mode normal** ; `MAX_TURNS` = garde-fou.
- **Résolution de leçon — jamais de choix implicite** : indice optionnel capturé par `classify` → resolver déterministe (par `metadata.theme`/titre) qui renvoie un **ensemble de candidats**. 1 candidat unique → on enchaîne ; 0 ou >1 → nœud **`clarify`** (liste les leçons depuis la DB et demande). **Pas de leçon par défaut silencieuse.** Flag `pendingLessonChoice` pour traiter la réponse au tour suivant sans re-`classify`. Détail en §6.
- **`session_trace`** : append incrémental via un helper ajouté à `memory/` (non couvert par l'API étape 1).
- **Sélection des concepts = déterministe, pilotée par les lacunes + récence** (détail dans le callout §5.3) : tiers inconnu → faible → secure périmé ; bornée par séance (borne **configurable**, pas en dur) ; lacunes d'abord, ordre de leçon en départage. La sélection ne donne **pas** la main au LLM (altitude : code décide *quel* concept).
- **Temporalité / répétition espacée** (décision 13/06, profondeur = **récence + intervalle par niveau**, **pas** SM-2) : un concept secure redevient éligible quand `now() − last_reviewed_at ≥ intervalle(level)`. **Éligibilité dérivée à la lecture, pas un statut stocké** (un flag matérialisé serait faux entre deux runs). Seule écriture nouvelle = `mastery.last_reviewed_at`, bumpée à chaque révision aboutie (même sans changement de niveau), découplée du `NOOP` “no change”. **Construit après le cœur** (slice 2.7).
- **Découpage en sous-tranches (un commit validé chacune)** — état détaillé en **§16** : ✅ 2.0 deps + factory · ✅ 2.1 router parent · ✅ 2.2 seam streaming + front `useChat` · ✅ 2.3 `revise` 1er tour · ✅ 2.4 multi-tours + `evaluate` gated + `PostgresSaver` + filtre nœuds internes · ✅ 2.5 update mémoire incrémental + `session_trace` · ✅ 2.6 resolver leçon (candidats + `clarify`) + finitions end-to-end · ✅ 2.7 répétition espacée Leitner (`last_reviewed_at` + `review_step` + 3e tier sélection) · ⏳ 2.8 garde-fou ESLint ciblé (`typescript-eslint` minimal : `no-floating-promises`, famille `no-unsafe-*`, `no-unnecessary-type-assertion`, `no-non-null-assertion`, `consistent-type-assertions` avec `objectLiteralTypeAssertions: 'never'` → pousse vers `satisfies` ; **PAS** d'interdiction globale de `as`).

---

## 16. Étape 2 — journal d'implémentation & état (mise à jour 15/06, post-2.7)

> **Pour un agent qui reprend à froid :** cette section est le point d'entrée de l'étape 2. Elle dit ce qui tourne déjà, ce qui reste, et les pièges techniques découverts (à lire AVANT de coder 2.4+). Les décisions de conception sont en §5.3 / §6 / §15 ; ici c'est l'état réel du code.

### 16.1 Versions installées (vérifiées, pinées)
- `@langchain/langgraph@^1.4.2`, `@langchain/core@^1.1.49`, `@langchain/anthropic@^1.4.1`, `langchain@^1.4.5` (méta-package, pour `initChatModel`).
- `ai@^6.0.204`, `@ai-sdk/react@^3.0.206`, `@ai-sdk/langchain@^2.0.211`.
- zod **v4**, Prisma **7**, Node 20.

### 16.2 État par sous-slice
| # | État | Contenu livré | Fichiers clés |
|---|---|---|---|
| 2.0 | ✅ | Factory modèle par-rôle. `getModel(role)` **async** via `initChatModel` (multi-provider réel : provider = config, `LLM_PROVIDER_/MODEL_/TEMPERATURE_<ROLE>`). Politique pure `resolveModelConfig` testée. | `llm/models.ts` (+`.unit.test`) |
| 2.1 | ✅ | Router parent : nœud `classify` + `routeOnIntent` pur (confiance basse/intent absent → `clarify`). Sous-graphes `qa`/`ingest` = placeholders ; `out_of_scope`/`clarify` finaux. | `graphs/intent.ts`, `graphs/router.graph.ts` (+`.unit.test`) |
| 2.2 | ✅ | Seam streaming bout-en-bout. `/api/chat` valide le body, `toBaseMessages`, lance le graphe, renvoie un `UIMessageStream` pipé dans Fastify. Front `useChat<TutorUIMessage>` + rendu parts-based. | `server.ts`, `frontend/src/App.tsx`, `shared/src/index.ts` (`TutorUIMessage`) |
| 2.3 | ✅ | `revise` 1er tour : `hydrate` (via `hydrateForRevision`) → `selectConcepts` (lacunes d'abord, tiers 1+2) → question socratique **streamée token/token**. Vérifié en live (navigateur + curl). | `graphs/revise.ts` (+`.unit.test`), `server.ts` (handler streaming) |
| 2.4 | ✅ | Multi-tours (machine à états run-to-END), livré en 3 commits : **(a)** `PostgresSaver` sur le graphe parent + handler n'envoie que le **dernier** message (le checkpointer accumule) ; **(b)** nœuds `evaluate` (signal de maîtrise structuré, `bindTools`, modèle cheap) → `decideAfterEvaluate`/`decideAfterAdvance` purs → `advance`/`finish` ; boucle concepts portée par l'état ; `routeStart` saute `classify` sur flow actif (§5.1) ; **(c)** filtre générique des nœuds internes (`classify`+`evaluate`) hors flux UI. Vérifié live (skip-classify + continue→relance + resolved→concept suivant ; plus aucun part `tool-*` ne fuit). | `checkpoint/index.ts`, `graphs/revise.ts`, `graphs/ui-stream.ts`, `graphs/router.graph.ts`, `server.ts` |
| 2.5 | ✅ | Update mémoire incrémental, 2 commits : **(a)** helper `session_trace` (`start`/`append`/`end`, append = concat jsonb atomique). **(b)** `advanceNode` = **seul** site d'écriture : `masterySignalToOp` pur (champs absents **omis**, pas nullés → merge §4.5) → `applyMasteryOps` (état+history en transaction, `runId = thread_id`) + `appendSessionTraceEntry`. `hydrate` ouvre le trace, `finish` le ferme. **Gated** : `advance` ne tourne que sur résolution (signal positif ou plafond forcé) → un `continue` n'écrit rien (§4.7). L'op est un `update` générique ; l'applier dérive add/update. Vérifié live (mastery `add`/secure + history avec provenance `revise` + entrée de trace ; `continue` = 0 écriture). | `memory/session-trace.ts`, `graphs/revise.ts`, `graphs/router.graph.ts` |
| 2.6 | ✅ | Resolver de leçon, 3 commits. Câblage (`lesson-resolver.ts`) : nœud `resolveLesson` → `afterResolveLesson` route `resolved → revise(hydrate)` sinon message + `END` ; `routeStart` ajoute `pendingLessonChoice → resolveLesson` (saut de classify, réponse brute « la 12 » re-résolue) ; `hydrate` consomme `state.lessonId` (scaffolding `findFirstOrThrow` **supprimé**, élève = unique POC). **Matching = pick LLM sur enum fermé** (décision : le matching flou est une tâche d'intelligence, pas de plomberie — le matcher manuel substring+stopwords était fragile) : un modèle cheap choisit une **clé** dans un catalogue (titre+thème+concepts) injecté de la DB, schéma `z.enum([...clés,"none","ambiguous"])` (même pattern `bindTools` que `classify` → ne peut pas inventer de leçon ; `resolveLesson` ajouté au filtre nœuds internes). 1 leçon → résolu **sans appel** ; `none → not_found`, `ambiguous → clarify`, malformé → `ambiguous` ; **aucun défaut silencieux**. Pur testé : `interpretChoice` (clé→résolution), `buildLessonClarification`. Vérifié live (« Napoléon » hors titre ; n° ; « celle sur les rois après l'empire » ; ambigu→« la 12 »→revise ; not_found ; aucune fuite `tool-*`). | `graphs/lesson-resolver.ts`, `graphs/intent.ts`, `graphs/revise.ts`, `graphs/router.graph.ts`, `graphs/ui-stream.ts`, `memory/repositories.ts` |
| 2.7 | ✅ | Répétition espacée **style Leitner** (paliers croissants, **pas** d'ease factor — décision : s'inspirer d'Anki sans la complexité SM-2), 2 commits. **(a)** migration `mastery.last_reviewed_at`(nullable) + `review_step`(int) ; `memory/srs.ts` pur : échelle `[1,2,4,8]` jours (env `SRS_SECURE_INTERVALS_DAYS`), `nextReviewStep` (secure→secure grimpe d'un cran, devient-secure→0, retombe→0), `isSecureDue` (dérivé à `now`, jamais stocké). `applyMasteryOps` gagne `reviewedAt` → stampe `last_reviewed_at`+`review_step` **même sur NOOP** (touche de révision découplée de la policy d'état, **sans** ligne d'history) ; `advance` passe `reviewedAt:now()`. **(b)** 3e tier de sélection : `ConceptMastery` porte les 2 champs, `selectConcepts(concepts, now, …)` ajoute les `secure` périmés après inconnu/faible (frais-secure exclus). Migration via `migrate dev` direct (piège de drift réglé). Vérifié live : leçon tout-secure-frais → clôt ; antidate 1 concept → re-sélectionné → ré-révision réussie grimpe le palier (0→1) + re-stampe. | `prisma/schema.prisma`, `memory/srs.ts`, `memory/mastery-applier.ts`, `memory/hydration.ts`, `graphs/revise.ts` |
| 2.8 | ⏳ | Garde-fou ESLint ciblé (dernière slice). | racine + `eslint.config` |

### 16.3 Architecture câblée à ce jour (ce qui tourne vraiment)
- **Flux d'un POST `/api/chat`** : `ChatBodySchema.safeParse` (400 si malformé) → `validateUIMessages` → on ne convertit que **le dernier message** (`uiMessages.at(-1)`, 400 si vide) via `toBaseMessages` (le checkpointer porte l'historique ; envoyer toute la liste le **dupliquerait**) → `router.stream({messages},{streamMode:["messages","values"],configurable:{thread_id}})` → `withoutInternalNodes(graphStream)` (filtre) → on **draine** le `toUIMessageStream` via un reader loop dans `createUIMessageStream` : on forwarde chaque chunk, on note si un `text-delta` est passé (`streamedText`), et **si rien n'a streamé** (nœud déterministe) on émet le texte final de l'état comme un text part (fallback). Réponse pipée dans la reply Fastify (`Readable.fromWeb`, cast d'interop documenté).
- **Checkpointer** : `PostgresSaver.fromConnString(DATABASE_URL, { schema: "langgraph" })` + `.setup()` au boot (idempotent), passé à `buildRouterGraph(checkpointer)` → `.compile({checkpointer})`. Sur le graphe parent uniquement (`checkpoint/index.ts`). **Schéma dédié `langgraph`** (pas `public`) pour ne pas entrer en conflit avec les migrations Prisma (cf. 16.4 §11). Tests : in-memory.
- **Graphe parent** (`RouterState` = `MessagesAnnotation` + scalaires `intent`/`confidence`/`pendingLessonChoice` + canaux de session revise `studentId`/`lessonId`/`sessionConceptIds`/`conceptCursor`/`turnsOnConcept`/`reviseActive`/`masterySignal`/`sessionTraceId`, tous reducer last-value) :
  - `START → routeStart` : `reviseActive ? evaluate : pendingLessonChoice ? resolveLesson : classify` (sauts de `classify` §5.1/§6).
  - `classify → routeOnIntent → { revise → resolveLesson | qa/ingest (placeholder) | out_of_scope | clarify }`.
  - `resolveLesson → afterResolveLesson{ resolved → revise(hydrate) | sinon END (message clarify/empty déjà émis) }`.
  - branche revise : `revise(hydrate) → afterHydrate{socratic|finish}` ; `evaluate → decideAfterEvaluate{advance|socratic}` ; `advance → decideAfterAdvance{socratic|finish}` ; `socratic → END`, `finish → END`. **Un POST = un tour.**
- **`classify`** : `getModel("classifier").bindTools([{name, schema: IntentSchema}], {tool_choice})` puis lecture de `response.tool_calls[0].args` validée en zod (voir 16.4 §1 pour le POURQUOI). N'extrait QUE `{intent, confidence}` (le resolver fait le pick leçon). Malformé → `intent:null` → `clarify`.
- **`resolveLesson`** (`lesson-resolver.ts`) : **pick LLM sur enum fermé** (modèle `classifier`, cheap). Catalogue (titre+thème+concepts) lu en DB → `bindTools` schéma `z.enum([...clésRéelles,"none","ambiguous"])`, `tool_choice` forcé ; le modèle voit `state.messages` et choisit une clé. `interpretChoice(clé)` (pur) → `{resolved → lessonId} | {not_found("none") | ambiguous → clarify + pendingLessonChoice:true}` ; **1 leçon → résolu sans appel** ; `empty → message ingest`. Le modèle **ne peut pas inventer** de leçon (enum), `lessonId` remis à null sur tout cas non-résolu, clarify = liste lue en DB. **Nœud interne** (filtre UI) car son `tool_use` ne doit pas fuiter.
- **`evaluate`** : même pattern `bindTools` (schéma `MasterySignalSchema` = `{status, level?, rationale?}`, **distinct** de `MasteryOp`), modèle rôle `evaluate` (cheap). Malformé → `{status:"continue"}` (jamais de résolution fausse).
- **`hydrate`/`socratic`/`evaluate`/`advance`/`finish`** : `hydrate` consomme `state.lessonId` (posé par le resolver) ; élève = **unique POC** (`resolveStudent` = `findFirstOrThrow`). `hydrate` (1er tour) arme la file via `selectConcepts` **et ouvre le `session_trace`** (`sessionTraceId` en état) ; `socratic`/`evaluate`/`advance` re-hydratent par tour (`loadCurrentConcept`, DB autoritaire) et lisent le concept au curseur.
- **`advance` = SEUL site d'écriture mémoire** : `masterySignalToOp` (pur, champs absents omis → merge §4.5) → `applyMasteryOps` (état+history en transaction, `changedBy:"revise"`, `runId = config.configurable.thread_id`) + `appendSessionTraceEntry`. `finish` ferme le trace (`endSessionTrace`). Gated : `advance` n'est atteint que sur résolution → `continue` n'écrit rien.
- **`decide` déterministes purs** (`decideAfterEvaluate` : `resolved` ou `turnsOnConcept >= MAX_TURNS(4)` → `advance` ; sinon `socratic`. `decideAfterAdvance` : curseur hors borne → `finish`).
- **Répétition espacée (2.7, Leitner)** : `selectConcepts(concepts, now, …)` a un **3e tier** = `secure` périmés (`isSecureDue`, `srs.ts`) après inconnu/faible ; `advance` stampe `last_reviewed_at`+`review_step` via `applyMasteryOps({reviewedAt})` (découplé du NOOP, sans history). Échelle `[1,2,4,8]` j (env `SRS_SECURE_INTERVALS_DAYS`).
- **Pas encore câblés** : garde-fou ESLint (2.8). `qa`/`ingest` restent des placeholders.

### 16.4 Leçons apprises / pièges (À LIRE avant 2.6+)
1. **`withStructuredOutput` CASSE sous `streamMode:["messages"]`** (`OUTPUT_PARSING_FAILURE` : son parser reçoit du texte vide). Diagnostiqué en script isolé. **Fix retenu : `bindTools` + lecture directe de `tool_calls[0].args` + validation zod.** ❌ `disableStreaming` = no-op sous LangGraph (ne change pas le chemin). ❌ `method:"jsonSchema"` (sortie native) corrige le parse MAIS **stream le JSON comme texte visible** dans l'UI et casse le fallback déterministe (16.4 §2). Le `tool_use` n'étant pas du texte, `bindTools` reste le bon choix tant qu'on streame le graphe. → **`evaluate` (2.4) DOIT utiliser le même pattern `bindTools`.**
2. **`toUIMessageStream` ne surface PAS un `AIMessage` statique** (texte d'un nœud déterministe sans appel LLM) — il n'émet du texte que pour les vrais tokens LLM (`streamMode:messages`). D'où le **fallback** dans le handler (réécrit le texte final si rien n'a streamé). Garder ce fallback tant qu'il y a des nœuds à texte fixe (out_of_scope, clarify, placeholders).
3. **Filtre nœuds internes (FAIT en 2.4c).** `classify`/`evaluate` émettaient leurs chunks `tool_use` dans le flux — l'adaptateur les surfaçait en parts `tool-input-*` (pas ignorés ! vérifié). `withoutInternalNodes` (`graphs/ui-stream.ts`) drop les tuples `["messages",[chunk,{langgraph_node ∈ {classify,evaluate,resolveLesson}}]]` avant `toUIMessageStream` (tout nœud à `tool_use` interne s'ajoute là). Deux constats importants : **(a)** la friction de typage anticipée (`Readable.toWeb(...)`) **n'existe pas** — `toUIMessageStream` accepte n'importe quel `AsyncIterable`, donc un **générateur async** se passe directement (seul un cast vers `Parameters<typeof toUIMessageStream>[0]` est requis) ; **(b)** filtrer **seulement** le mode `"messages"` suffit : `classify`/`evaluate` ne renvoient **pas** `{messages}` (juste des scalaires), donc leur `tool_use` n'apparaît jamais dans le mode `"values"` (qui doit passer pour `onFinish`).
4. **Multi-provider** : on instancie via `initChatModel` (du package `langchain`). `getModel` est **async** (import lazy du provider) → tous les appelants `await`. Pour brancher un 2e provider : `pnpm add @langchain/<provider>` + `LLM_PROVIDER_<ROLE>=...`.
5. **`tsx watch` + `EADDRINUSE` sur :3001** (piège du CLAUDE.md, vu plusieurs fois) : un reload peut laisser un process zombie qui sert l'**ancien** code. Avant de tester un changement backend : `preview_stop` puis tuer le node sur 3001 (`lsof -ti :3001 | …`) et redémarrer **proprement**. Ne pas se fier au reload silencieux.
6. **DB de dev ≠ `tuteur_test`** : les tests provisionnent `tuteur_test`, mais le serveur de dev tape `DATABASE_URL` (base `tuteur`). Avant de tester `revise` : `prisma migrate deploy` + `db:seed` **sur la base de dev** (sinon hydrate échoue / pas de concepts).
7. **Typecheck** : utiliser **`pnpm typecheck` racine (turbo, `dependsOn:^build`)** qui rebuild `shared` d'abord — pas `pnpm -r typecheck` (bypasse le build de `shared` → faux négatifs sur `TutorUIMessage`). Le `dist` de `shared` est consommé par le front (typecheck **et** runtime Vite).
8. **Strictness TS** activée (`tsconfig.base.json`) : `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`. → `concepts[i]` est `T | undefined`, gérer. (`noUnusedParameters` : un nœud LangGraph qui n'utilise pas `state` — ex. `hydrate` 1er tour — se déclare **sans argument**, pas `_state`.)
9. **Checkpointer + handler = n'envoyer que le DERNIER message.** Avec le `PostgresSaver`, le thread persiste déjà le transcript ; le handler feed `{messages:[uiMessages.at(-1)]}` et le reducer d'append de `MessagesAnnotation` étend l'historique. Envoyer toute la liste `useChat` à chaque tour **dupliquerait** les messages persistés. Le `routeStart` lit l'état **rechargé** du checkpoint (`reviseActive`) après merge de l'input → décide `classify` vs `evaluate`. *(Le guard resume-vs-`Command` du §6 reste pour le HIL de l'étape 3 ; ici le « saut de classify » est purement une arête conditionnelle au START.)*
10. **Écriture mémoire depuis un nœud (2.5).** Le `thread_id` (= `runId` d'audit) n'est pas dans l'état mais dans le **2e argument** du nœud : `(state, config: LangGraphRunnableConfig)` → `config.configurable?.thread_id`. **L'op-string passée à l'applier n'a pas d'importance** pour l'audit : `decideMasteryAction` dérive `insert`/`update` de l'existence d'une ligne, et `mastery_history.op` est dérivé de l'**action**, pas de l'op. On passe donc un `"update"` générique. **Merge §4.5** : un champ `undefined` dans la `MasteryOp` est préservé, un `null` **écraserait** → le mapper **omet** les champs absents du signal (ne les met pas à `null`). Append `session_trace` = concat jsonb atomique (pas de read-modify-write).
11. **Le checkpointer vit dans son PROPRE schéma `langgraph` (pas `public`).** `PostgresSaver.fromConnString(url, { schema: "langgraph" })` ([checkpoint/index.ts](apps/backend/src/checkpoint/index.ts)) : LangGraph gère ses tables `checkpoints*` lui-même (`setup()` fait `CREATE SCHEMA IF NOT EXISTS` + sa propre table `checkpoint_migrations`), Prisma possède `public`. **Les deux systèmes de migration ne se chevauchent plus** → `migrate dev` est de nouveau sûr (« Already in sync », pas de drift, pas de reset). *Pourquoi ça importe (découvert le 14/06) :* tant que le checkpointer écrivait dans `public`, Prisma voyait ses tables comme une **drift** et proposait un **reset destructif**. La migration `drop_mastery_confidence` avait été écrite à la main pour contourner ça — désormais inutile : **pour `last_reviewed_at` (2.7), `migrate dev` normal fonctionne.** *(Sur une base de dev déjà polluée : `DROP TABLE public.checkpoint*` une fois ; un checkout neuf crée directement dans `langgraph`.)*

### 16.5 Lancer & tester en local
- Postgres up (`docker compose up -d postgres`), puis `prisma migrate deploy` + `db:seed` (base de dev).
- Serveurs : `.claude/launch.json` a 2 configs (`backend` :3001, `frontend` :5173) ; le proxy Vite `/api → :3001` existe.
- Test direct backend (format UIMessage) :
  ```bash
  curl -sN -X POST http://localhost:3001/api/chat -H 'content-type: application/json' \
    -d '{"id":"t1","messages":[{"id":"m1","role":"user","parts":[{"type":"text","text":"fais-moi réviser la leçon sur Napoléon"}]}]}'
  ```
  Attendu : `text-delta` de la question socratique (revise) ou de la redirection (out_of_scope). Aucun `type:"error"`.
