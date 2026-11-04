# moneyprinterturbo-mcp

Adaptateur MCP/HTTP devant [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MPT). Voir `CONTEXT.md`.

## Développement

```
pnpm dev
```

Lance `kokoro` (TTS) et `mpt-api` (image officielle `ghcr.io/harry0703/moneyprinterturbo`) dans Docker, puis le MCP en local avec rechargement à chaud (port 4600).

### Premier lancement

1. `cp .env.example .env`, puis renseigner les clés (`MPT_BASE_URL` reste `http://localhost:8080` : le MCP tourne sur l'hôte).
2. `pnpm dev` : `pnpm setup` prépare `config.toml` (monté dans le conteneur, jamais versionné car il contient des secrets) :
   - s'il existe déjà, il est conservé ;
   - sinon, le `config.example.toml` du repo officiel est téléchargé.

   Dans ce second cas, `[kokoro] base_url` est pointé vers `http://kokoro:8880/v1` (MPT tourne dans Docker, `127.0.0.1` y désignerait le conteneur lui-même). Il reste à renseigner tes clés dans `config.toml`.

### Image MoneyPrinterTurbo

- `MPT_IMAGE=<image>` dans l'environnement remplace l'image officielle (fork publié, tag précis).
- Le provider vidéo `comfyui` (`video_source = "comfyui"`, `comfyui_api_key`) n'existe pas dans l'image officielle : il demande un fork. Pour builder le tien : `docker compose -f docker-compose.yml -f docker-compose.fork.yml up --build` (`MPT_DIR` = repo du fork, par défaut `../MoneyPrinterTurbo`).

Autres scripts : `pnpm dev:infra:down` (arrête MPT et Kokoro), `pnpm webui` (interface Streamlit de MPT sur :8501), `pnpm dev:docker` (tout dans Docker, MCP compris).
