# moneyprinterturbo-mcp

Adaptateur MCP/HTTP devant [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MPT). Voir `CONTEXT.md`.

## Développement

```
pnpm dev
```

Lance `kokoro` (TTS) et `mpt-api` (build du repo `../MoneyPrinterTurbo`) dans Docker, puis le MCP en local avec rechargement à chaud (port 4600).

### Premier lancement

1. `cp .env.example .env`, puis renseigner les clés (`MPT_BASE_URL` reste `http://localhost:8080` : le MCP tourne sur l'hôte).
2. Dans `../MoneyPrinterTurbo` : `cp config.example.toml config.toml` (jamais versionné : il contient des secrets), puis :
   - `[kokoro] base_url = "http://kokoro:8880/v1"` : MPT tourne dans Docker, `127.0.0.1` y désignerait le conteneur lui-même ;
   - `comfyui_api_key` si `video_source = "comfyui"`.
3. `pnpm dev`.

Autres scripts : `pnpm dev:infra:down` (arrête MPT et Kokoro), `pnpm webui` (interface Streamlit de MPT sur :8501), `pnpm dev:docker` (tout dans Docker, MCP compris).
