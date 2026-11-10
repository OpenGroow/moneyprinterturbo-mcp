# moneyprinterturbo-mcp

An MCP/HTTP adapter in front of [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MPT), built to work with [OpenGroow](https://github.com/OpenGroow/OpenGroow). It exposes MPT's short-video generation as MCP tools to an agent; publishing is done on the OpenGroow side, from the URL returned by `get_video`. Domain vocabulary: `GLOSSARY.md`.

## How it works

```
OpenGroow Agent ──MCP (POST /mcp)──▶ moneyprinterturbo-mcp ──HTTP──▶ MoneyPrinterTurbo
```

- `POST /mcp`: MCP server (streamable HTTP, sessionless: one call = one request). Tools:
  - `produce_video`: starts producing a reel from a subject (and optionally a script) and returns a `runId` right away;
  - `get_run_status`: status of the `runId` (`pending`, `running`, `completed`, `failed`);
  - `get_video`: once the run is `completed`, returns `{ runId, videoUrl }`, the public URL of the final video (`<PUBLIC_BASE_URL>/videos/<runId>/final`). `PUBLIC_BASE_URL` is the address of this server reachable from the outside (a tunnel when running locally); without it, `get_video` answers a `not_configured` error.
  - `get_project_status`: called by OpenGroow when an Agent is activated, with the Agent's key. A wrong key gets a 401, so the activation fails; with the right key it answers `{ configured: true }`, or `{ configured: false, message }` when MoneyPrinterTurbo is unreachable or `PUBLIC_BASE_URL` is not set.
- `GET /videos/:runId/final`: the final video, playable in a `<video>` tag.
- `GET /health`: health check.

`/mcp` authenticates with `Authorization: Bearer <key>`. The key is `MCP_API_KEY`.

## Using it with OpenGroow

OpenGroow describes its agents with Templates, published on [GroowHub](https://github.com/OpenGroow/groowhub). A Template declares the MCP servers it uses in its profile (`profiles/opengroow.yml`), and their configuration ships with it. The Template for this server is `@opengroow/moneyprinterturbo`.

This server is not bundled in the Template: you run it yourself, and the Template points to it.

1. Start this server (see below) and note its URL: `http://<host>:<PORT>/mcp`. From OpenGroow's OpenClaw container, the host is `host.docker.internal` (the only accepted Host values are `localhost`, `127.0.0.1`, `[::1]` and `host.docker.internal`). The Template's default is `http://host.docker.internal:4600/mcp`, which matches the default `PORT`. On a self-hosted OpenGroow, if your server lives elsewhere, override the MCP URL of the installed Template instead of editing the package.
2. Set a key in `.env` (`MCP_API_KEY`).
3. Give the same key to the agent as the Template's `apiKey` secret. See OpenGroow's [Template development](https://github.com/OpenGroow/OpenGroow/blob/main/docs/TEMPLATE_DEVELOPMENT.md) guide for the exact format.

## Getting started

Requirements: Docker, Node.js, [pnpm](https://pnpm.io).

```
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` starts MoneyPrinterTurbo (official image `ghcr.io/harry0703/moneyprinterturbo`) in Docker, then this server locally with hot reload.

### Configuration

1. **`.env`**: set the keys. `PORT`, `MPT_IMAGE` and `MPT_BASE_URL` have a value in `.env.example`; inside the Docker container, `MPT_BASE_URL` is replaced by `http://mpt-api:8080`.
   - `MCP_API_KEY`: the bearer key of `/mcp`;
   - `MPT_MAX_CLIPS=1`: caps `video_terms` to N terms; MPT generates one ComfyUI clip per term, so 1 = a single clip (quick test). No effect if `video_terms` is not passed to `produce_video`;
   - `MPT_DEFAULT_VIDEO_SOURCE` / `MPT_DEFAULT_VOICE_NAME`: values `produce_video` applies when the caller leaves them out (for example `comfyui` and a Kokoro voice with a fork of MPT); without them, MPT applies its own defaults;
   - `MPT_DRY_RUN=true`: `produce_video` logs its parameters and answers without calling MPT, `get_run_status` answers `completed`. Useful to test a flow without spending credits.
2. **`config.toml`**: MoneyPrinterTurbo's own configuration (LLM keys, TTS, stock media), mounted in the container. `pnpm dev` prepares it with `pnpm setup`:
   - if it already exists, it is kept;
   - otherwise, `config.example.toml` from the official repo is downloaded. Then fill in your keys.

   It is never committed, because it holds secrets. MPT runs in Docker: a local service URL must use the compose service name, not `127.0.0.1`.

### MoneyPrinterTurbo image

- `MPT_IMAGE` in `.env` selects the image. `.env.example` points to the official `:latest` image. Docker does not re-download an image it already has: `docker compose pull mpt-api` updates it. For a reproducible version, replace `latest` with a specific tag.
- The `comfyui` video provider (`video_source = "comfyui"`, `comfyui_api_key`) does not exist in the official image. It needs a fork of MoneyPrinterTurbo.

### Personal local stack

`docker-compose.local.yml` (git-ignored) can add services or replace MPT's image, for example to build a fork locally. To have it loaded automatically, add to `.env`:

```
COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml
```

### Scripts

| Script | Effect |
| --- | --- |
| `pnpm dev` | MPT in Docker + this server locally (port `PORT`) |
| `pnpm dev:docker` | everything in Docker, this server included |
| `pnpm dev:infra:down` | stops MPT |
| `pnpm webui` | MPT's Streamlit interface on :8501 |
| `pnpm setup` | prepares `config.toml` |
| `pnpm test` | unit tests |
| `pnpm typecheck` | type check |

## License

[MIT](LICENSE)
