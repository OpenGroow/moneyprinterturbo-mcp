# moneyprinterturbo-mcp

Adaptateur MCP/HTTP devant [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MPT). Voir `CONTEXT.md`.

## Développement

```
pnpm dev
```

Lance `mpt-api` (image officielle `ghcr.io/harry0703/moneyprinterturbo`) dans Docker, puis le MCP en local avec rechargement à chaud (port 4600).

### Premier lancement

1. `cp .env.example .env`, puis renseigner les clés (`MPT_BASE_URL` reste `http://localhost:8080` : le MCP tourne sur l'hôte).
2. `pnpm dev` : `pnpm setup` prépare `config.toml` (monté dans le conteneur, jamais versionné car il contient des secrets) :
   - s'il existe déjà, il est conservé ;
   - sinon, le `config.example.toml` du repo officiel est téléchargé.

   Il reste à renseigner tes clés dans `config.toml`. MPT tourne dans Docker : une URL de service local (TTS, etc.) doit utiliser le nom du service compose, pas `127.0.0.1`.

### Stack locale personnelle

`docker-compose.local.yml` (ignoré par git) peut ajouter des services à la stack. Pour qu'il soit chargé automatiquement, ajoute dans `.env` :

```
COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml
```

### Image MoneyPrinterTurbo

- `MPT_IMAGE` dans `.env` choisit l'image (`.env.example` pointe vers l'officielle). Pour un fork publié ou un tag précis, change cette ligne.
- Le provider vidéo `comfyui` (`video_source = "comfyui"`, `comfyui_api_key`) n'existe pas dans l'image officielle : il demande un fork. Pour builder le tien : `docker compose -f docker-compose.yml -f docker-compose.fork.yml up --build` (`MPT_DIR` = repo du fork, par défaut `../MoneyPrinterTurbo`).

Autres scripts : `pnpm dev:infra:down` (arrête MPT), `pnpm webui` (interface Streamlit de MPT sur :8501), `pnpm dev:docker` (tout dans Docker, MCP compris).
