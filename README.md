# moneyprinterturbo-mcp

Adaptateur MCP/HTTP devant [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MPT), conçu pour fonctionner avec [OpenGroow](https://github.com/OpenGroow/OpenGroow). Il expose la génération de vidéos courtes de MPT comme outils MCP à un agent ; la publication est faite côté OpenGroow, à partir de l'URL renvoyée par `get_video`. Vocabulaire du domaine : `GLOSSARY.md`.

## Fonctionnement

```
Agent OpenGroow ──MCP (POST /mcp)──▶ moneyprinterturbo-mcp ──HTTP──▶ MoneyPrinterTurbo
```

- `POST /mcp` : serveur MCP (streamable HTTP, sans session : un appel = une requête). Outils :
  - `produce_video` : lance la production d'un reel à partir d'un sujet (et éventuellement d'un script) et renvoie tout de suite un `runId` ;
  - `get_run_status` : statut du `runId` (`pending`, `running`, `completed`, `failed`) ;
  - `get_video` : une fois le run `completed`, renvoie `{ runId, videoUrl }`, l'URL publique de la vidéo finale (`<PUBLIC_BASE_URL>/videos/<runId>/final`). `PUBLIC_BASE_URL` est l'adresse de ce serveur joignable depuis l'extérieur (un tunnel en local) ; sans elle, `get_video` répond une erreur `not_configured`.
- `GET /videos/:runId/final` : la vidéo finale, lisible dans une balise `<video>`.
- `GET /health` : vérification de santé.

`/mcp` s'authentifie par `Authorization: Bearer <clé>`. Il y a une clé par marque (`MCP_API_KEY_<NOM>`) : la clé utilisée identifie la marque. Les marques sont listées dans `MCP_PROJECTS` (noms séparés par des virgules, `default` par défaut).

## Utilisation avec OpenGroow

OpenGroow décrit ses agents par des Templates, publiés sur [GroowHub](https://github.com/OpenGroow/groowhub). Un Template déclare dans son profil (`profiles/opengroow.yml`) les serveurs MCP qu'il utilise, et leur configuration est embarquée avec lui.

Ce serveur n'est pas embarqué dans le Template : tu le fais tourner toi-même, et le Template pointe vers lui.

1. Lance ce serveur (voir ci-dessous) et note son URL : `http://<hôte>:<PORT>/mcp`. Depuis le conteneur OpenClaw d'OpenGroow, l'hôte est `host.docker.internal` (les Host `localhost`, `127.0.0.1`, `[::1]` et `host.docker.internal` sont les seuls acceptés).
2. Déclare une clé pour la marque dans `.env` (`MCP_API_KEY_<NOM>`).
3. Dans le Template, déclare le serveur MCP avec cette URL, et donne la clé à l'agent comme secret. Voir le guide [Template development](https://github.com/OpenGroow/OpenGroow/blob/main/docs/TEMPLATE_DEVELOPMENT.md) d'OpenGroow pour le format exact.

## Démarrage

Prérequis : Docker, Node.js, [pnpm](https://pnpm.io).

```
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` lance MoneyPrinterTurbo (image officielle `ghcr.io/harry0703/moneyprinterturbo`) dans Docker, puis ce serveur en local avec rechargement à chaud.

### Configuration

1. **`.env`** : renseigne les clés. `PORT`, `MPT_IMAGE` et `MPT_BASE_URL` ont une valeur dans `.env.example` ; dans le conteneur Docker, `MPT_BASE_URL` est remplacé par `http://mpt-api:8080`.
   - `MCP_API_KEY_<NOM>` : une clé par marque de `MCP_PROJECTS` ;
   - `MPT_MAX_CLIPS=1` : plafonne `video_terms` à N termes ; MPT génère un clip ComfyUI par terme, donc 1 = un seul clip (test rapide). Sans effet si `video_terms` n'est pas fourni à `produce_video`.
   - `MPT_DRY_RUN=true` : `produce_video` logue ses paramètres et répond sans appeler MPT, `get_run_status` répond `completed`. Utile pour tester un flow sans dépenser de crédits.
2. **`config.toml`** : la configuration de MoneyPrinterTurbo (clés LLM, TTS, banques de médias), montée dans le conteneur. `pnpm dev` le prépare via `pnpm setup` :
   - s'il existe déjà, il est conservé ;
   - sinon, le `config.example.toml` du repo officiel est téléchargé. Renseigne ensuite tes clés dedans.

   Il n'est jamais versionné, car il contient des secrets. MPT tourne dans Docker : une URL de service local doit utiliser le nom du service compose, pas `127.0.0.1`.

### Image MoneyPrinterTurbo

- `MPT_IMAGE` dans `.env` choisit l'image. `.env.example` pointe vers l'image officielle `:latest`. Docker ne retélécharge pas une image déjà présente : `docker compose pull mpt-api` la met à jour. Pour une version reproductible, remplace `latest` par un tag précis.
- Le provider vidéo `comfyui` (`video_source = "comfyui"`, `comfyui_api_key`) n'existe pas dans l'image officielle. Il demande un fork de MoneyPrinterTurbo.

### Stack locale personnelle

`docker-compose.local.yml` (ignoré par git) peut ajouter des services ou remplacer l'image de MPT, par exemple pour construire un fork en local. Pour qu'il soit chargé automatiquement, ajoute dans `.env` :

```
COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml
```

### Scripts

| Script | Effet |
| --- | --- |
| `pnpm dev` | MPT dans Docker + ce serveur en local (port `PORT`) |
| `pnpm dev:docker` | tout dans Docker, ce serveur compris |
| `pnpm dev:infra:down` | arrête MPT |
| `pnpm webui` | interface Streamlit de MPT sur :8501 |
| `pnpm setup` | prépare `config.toml` |
| `pnpm test` | tests unitaires |
| `pnpm typecheck` | vérification des types |
