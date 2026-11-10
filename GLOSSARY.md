# Context: moneyprinterturbo-mcp

Domain glossary for the MCP adapter that exposes MoneyPrinterTurbo (MPT)
to OpenGroow. This file is a glossary, not an implementation spec.

## Terms

**Reel**
The short vertical/horizontal film produced by one `produce_video` call.
One call = one reel = one single final video (see *video_count* below).

**MPT (MoneyPrinterTurbo)**
The underlying generation engine. Deployed and managed independently of this
server (its own Docker, its own LLM/TTS/stock-footage key configuration) —
never vendored or imported. This server only calls it over HTTP, as a client
of its `/api/v1/*` API.

**Run**
The asynchronous unit of work identified by `runId`. This server keeps no
run state: `runId` *is* the `task_id` returned by MPT on
`POST /api/v1/videos`, and `get_run_status` queries MPT live
(`GET /api/v1/tasks/{runId}`) on every call instead of reading a local store.

**Run status**
`pending` / `running` / `completed` / `failed`, translated from MPT's numeric
`state`:
- `TASK_STATE_PROCESSING (4)` → `running`
- `TASK_STATE_COMPLETE (1)` → `completed`
- `TASK_STATE_FAILED (-1)` → `failed`
- `pending` is never produced by this server: an MPT task is already
  `processing` by the time `POST /api/v1/videos` answers, so `runId` is only
  handed to the caller once the run is already underway.

**video_count**
A native MPT parameter controlling the number of *independent final variants*
produced by one task (same script/narration/audio, different visual editing
for each variant) — they are not clips merged afterwards. This server forces
`video_count=1`: one `produce_video` = one final video, so that
`/videos/{runId}/final` and the result of `get_run_status` stay singular.

**API key**
A single bearer key (`MCP_API_KEY`, in env) protects `/mcp`. The server has no
per-caller configuration: no DB, no dashboard. Publishing is not done here,
but on the OpenGroow side.

## MCP contract exposed to OpenGroow

- `produce_video` — an almost direct passthrough of MPT's `VideoParams` schema
  (subject, optional script, voice, aspect, etc.), calls
  `POST /api/v1/videos`, returns `{ runId }`.
- `get_run_status(runId)` — live proxy to `GET /api/v1/tasks/{runId}`,
  translates the status (see above).
- `get_video(runId)` — once the run is `completed`, returns
  `{ runId, videoUrl }`, the public URL of the final video.

## HTTP routes

- `/videos/{runId}/final` — exempt from auth (protected by the
  unguessability of the uuid), serves the file by proxying the server-to-server
  call to MPT (`stream`/`download`) with the MPT key (`x-api-key`): this key
  never leaks to the reviewer's browser.
- `/mcp` — authenticated by `MCP_API_KEY`.
- `/health` — exempt from auth.
