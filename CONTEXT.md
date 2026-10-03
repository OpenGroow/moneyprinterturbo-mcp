# Contexte : moneyprinterturbo-mcp

Glossaire du domaine pour l'adaptateur MCP qui expose MoneyPrinterTurbo (MPT)
à Megaclaw. Ce fichier est un glossaire, pas une spec d'implémentation.

## Termes

**Reel**
Le court métrage vertical/horizontal produit par un appel à `create_reel`.
Un appel = un reel = une vidéo finale unique (voir *video_count* ci-dessous).

**MPT (MoneyPrinterTurbo)**
Le moteur de génération sous-jacent. Déployé et géré indépendamment de ce
serveur (son propre Docker, sa propre configuration de clés LLM/TTS/stock
footage) — jamais vendorisé ni importé. Ce serveur ne fait que l'appeler en
HTTP, comme un client de son API `/api/v1/*`.

**Job**
L'unité de travail asynchrone identifiée par `job_id`/`runId` côté Megaclaw.
Contrairement à openmontage-mcp, ce serveur ne tient aucun état de job
dupliqué : `job_id` *est* le `task_id` renvoyé par MPT sur
`POST /api/v1/videos`, et `get_job_status` interroge MPT en direct
(`GET /api/v1/tasks/{job_id}`) à chaque appel plutôt que de lire un store
local.

**Statut de job (vocabulaire fermé Megaclaw)**
`pending` / `running` / `completed` / `failed`, traduit depuis le `state`
numérique de MPT :
- `TASK_STATE_PROCESSING (4)` → `running`
- `TASK_STATE_COMPLETE (1)` → `completed`
- `TASK_STATE_FAILED (-1)` → `failed`
- `pending` n'est jamais produit par ce serveur : une tâche MPT est déjà
  `processing` au moment où `POST /api/v1/videos` répond, donc `job_id` n'est
  remis à l'appelant qu'une fois le job déjà en cours.

**video_count**
Paramètre natif de MPT contrôlant le nombre de *variantes finales
indépendantes* produites par une même tâche (même script/narration/audio,
montage visuel différent à chaque variante) — ce ne sont pas des clips
fusionnés ensuite. Ce serveur force `video_count=1` : un `create_reel` = une
vidéo finale, pour garder `/videos/{job_id}/final` et le résultat de
`get_job_status` singuliers.

**Project**
Une marque qui publie via le compte Postiz partagé de ce serveur
(Loveyoumake, Rezon, ...) — pas un tenant avec sa propre config étendue
comme dans seo-mcp/demo-video-mcp/carousel-mcp. Registre statique dans
`src/projects.ts` (non secret : nom + channel IDs Postiz par plateforme) ;
pas de DB, pas de dashboard. Chaque Project a sa propre clé bearer
(`MCP_API_KEY_<NAME>`, en env — c'est le secret), qui sert à la fois pour
`/mcp` et `/publish` : la clé *est* l'identité du Project, donc Megaclaw
n'a jamais besoin de dire explicitement pour quelle marque il agit.

## Contrat MCP exposé à Megaclaw

- `create_reel` — passthrough quasi-direct du schéma `VideoParams` de MPT
  (video_subject, video_script optionnel, voice_name, video_aspect, etc.),
  appelle `POST /api/v1/videos`, renvoie `{job_id}`.
- `get_job_status(runId)` — proxy live vers `GET /api/v1/tasks/{runId}`,
  traduit le statut (voir ci-dessus).
- `list_capabilities` — debuggabilité, non requis par le contrat Megaclaw.

## Routes HTTP

- `/videos/{job_id}/final` — exemptée d'auth (protégée par l'imprévisibilité
  de l'uuid), sert le fichier en proxysant l'appel serveur-à-serveur vers MPT
  (`stream`/`download`) avec la clé MPT (`x-api-key`) : cette clé ne fuite
  jamais vers le navigateur du reviewer.
- `/publish` — pousse le reel fini vers Postiz, authentifiée par la clé du
  Project (voir ci-dessus). Contrat réel de Postiz (upload multipart puis
  schedule avec `integration.id`), pas le contrat à plat d'openmontage-mcp.
  Le compte/token Postiz (`POSTIZ_TOKEN`/`POSTIZ_API_URL`/`POSTIZ_UPLOAD_URL`)
  est partagé avec les autres serveurs MCP (demo-video-mcp, carousel-mcp,
  seo-mcp — même instance Postiz) ; le `channelId` par plateforme est résolu
  depuis le Project authentifié (`src/projects.ts`), jamais passé par
  l'appelant. Body `{run_id, caption, platforms: ["instagram", "tiktok"]}`.
  Réponse `{results: [{platform, ok, id|error}]}` — un échec sur une
  plateforme ne bloque pas les autres.
- `/mcp` — même authentification par clé de Project (voir ci-dessus) ; la
  génération vidéo elle-même (`create_reel`/`get_job_status`) est agnostique
  de la marque, seule `/publish` lit `project.postizChannelIds`.
- `/health` — exemptée d'auth.
