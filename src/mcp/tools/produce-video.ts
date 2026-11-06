import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MptClient, MptClientError } from "../../mpt/client.js";
import { logger } from "../../logger.js";
import { stripTrailingSlash } from "../../util.js";
import { errorContent, jsonContent } from "./result.js";

// produce_video / get_run_status: the async produce/poll pair Megaclaw's
// ExternalJobPollingContract calls get_run_status({runId}) against (one
// argument, camelCase, no separate project_id channel -- see CONTEXT.md).
// Unlike demo-video-mcp's own produce_video, MPT itself owns the async
// pipeline once /api/v1/videos accepts the job, so there is nothing to
// background here: this tool just awaits MPT's accept and returns.

export interface ProduceVideoDeps {
  mptClient: MptClient;
  // When true, MPT is never called: produce_video logs its params and returns a fake runId.
  dryRun?: boolean;
  // Caps video_terms to this many entries (MPT_MAX_CLIPS). MPT generates one
  // ComfyUI clip per term, so 1 means a single clip: a cheap, fast test run.
  maxClips?: number;
  // Public origin of this server (the one a browser and Postiz can reach, for
  // example a tunnel). get_video builds the video URL from it; unset, get_video
  // answers a not_configured error and every other tool is unaffected.
  publicBaseUrl?: string;
}

// A near-direct passthrough of MPT's own VideoParams (app/models/schema.py)
// -- fields are `.optional()` rather than redeclaring MPT's own defaults, so
// the two schemas can't drift. video_count is deliberately NOT a field here:
// it is forced to 1 inside MptClient.createVideo and must never be a
// caller-facing lever (see CONTEXT.md).
const produceVideoShape = {
  video_subject: z.string().min(1),
  video_script: z.string().optional(),
  video_terms: z.union([z.string(), z.array(z.string())]).optional(),
  video_aspect: z.string().optional(),
  video_fit_mode: z.string().optional(),
  video_concat_mode: z.string().optional(),
  video_transition_mode: z.string().optional(),
  video_clip_duration: z.number().optional(),
  video_clip_speed: z.number().optional(),
  match_materials_to_script: z.boolean().optional(),
  video_source: z.string().optional(),
  custom_audio_file: z.string().optional(),
  video_language: z.string().optional(),
  voice_name: z.string().optional(),
  voice_volume: z.number().optional(),
  voice_rate: z.number().optional(),
  bgm_type: z.string().optional(),
  bgm_file: z.string().optional(),
  bgm_volume: z.number().optional(),
  video_music_prompt: z.string().optional(),
  subtitle_enabled: z.boolean().optional(),
  subtitle_position: z.string().optional(),
  subtitle_display_mode: z.string().optional(),
  subtitle_animation: z.string().optional(),
  font_name: z.string().optional(),
  text_fore_color: z.string().optional(),
  font_size: z.number().optional(),
  stroke_color: z.string().optional(),
  stroke_width: z.number().optional(),
  n_threads: z.number().optional(),
  paragraph_number: z.number().optional(),
  video_script_prompt: z.string().optional(),
  custom_system_prompt: z.string().optional(),
} as const;

// Both tools call MptClient; both must surface an MptClientError the same
// way, so this is the single place that translates it into a tool result.
async function callMpt<T>(work: () => Promise<T>): Promise<T | ReturnType<typeof errorContent>> {
  try {
    return await work();
  } catch (err) {
    logger.error({ err }, "MPT tool call failed");
    if (err instanceof MptClientError) {
      return errorContent(err.category, err.message);
    }
    throw err;
  }
}

// The URL of GET /videos/:runId/final (routes/videos.ts). Frozen at the end of
// the job and valid for as long as MPT keeps the file.
export function finalVideoUrl(publicBaseUrl: string, runId: string): string {
  return `${stripTrailingSlash(publicBaseUrl)}/videos/${encodeURIComponent(runId)}/final`;
}

export function capVideoTerms(
  terms: string | string[] | undefined,
  maxClips: number | undefined,
): string | string[] | undefined {
  if (terms === undefined || maxClips === undefined) return terms;
  const list = Array.isArray(terms) ? terms : terms.split(",").map((t) => t.trim()).filter(Boolean);
  return list.slice(0, maxClips);
}

export function registerProduceVideoTools(server: McpServer, deps: ProduceVideoDeps) {
  server.registerTool(
    "produce_video",
    {
      description:
        "Produces a short-form reel from a subject (and optionally a full script) via MoneyPrinterTurbo. Returns immediately with a runId; poll get_run_status(runId) until status is completed or failed.",
      inputSchema: produceVideoShape,
    },
    async (rawParams) =>
      callMpt(async () => {
        const params = { ...rawParams };
        if (deps.maxClips !== undefined) {
          if (rawParams.video_terms === undefined) {
            logger.warn(
              `MPT_MAX_CLIPS=${deps.maxClips} ignored: no video_terms given, MPT will pick its own terms`,
            );
          } else {
            params.video_terms = capVideoTerms(rawParams.video_terms, deps.maxClips);
            logger.info(`video_terms capped to ${deps.maxClips} (MPT_MAX_CLIPS)`);
          }
        }
        logger.info(
          `produce_video received${deps.dryRun ? " (dry-run, MPT not called)" : ""}:\n${JSON.stringify(params, null, 2)}`,
        );
        if (deps.dryRun) {
          return jsonContent({ runId: randomUUID(), status: "started", dryRun: true });
        }
        const { taskId } = await deps.mptClient.createVideo(params);
        return jsonContent({ runId: taskId, status: "started" });
      }),
  );

  server.registerTool(
    "get_run_status",
    {
      description:
        "Returns the current status of a run started by produce_video: pending, running, completed, or failed. runId is MoneyPrinterTurbo's own task_id.",
      inputSchema: {
        runId: z.string().uuid(),
      },
    },
    async ({ runId }) =>
      callMpt(async () => {
        if (deps.dryRun) {
          return jsonContent({ runId, status: "completed", dryRun: true });
        }
        const task = await deps.mptClient.getTask(runId);
        if (!task) {
          return errorContent("not_found", "Run not found", { runId });
        }
        const isInFlight = task.status === "pending" || task.status === "running";
        return jsonContent({
          runId: task.taskId,
          status: task.status,
          ...(isInFlight ? { nextPollAfterSeconds: 15 } : {}),
          ...(task.status === "completed" ? { output: { taskId: task.taskId } } : {}),
        });
      }),
  );

  server.registerTool(
    "get_video",
    {
      description:
        "Returns the public URL of the final video of a completed run started by produce_video: { runId, videoUrl }. Call it once get_run_status reports completed. The URL must be reachable by a browser and by Postiz.",
      inputSchema: {
        runId: z.string().uuid(),
      },
    },
    async ({ runId }) =>
      callMpt(async () => {
        if (!deps.publicBaseUrl) {
          return errorContent("not_configured", "PUBLIC_BASE_URL is not set: cannot build a public video URL");
        }
        if (deps.dryRun) {
          return jsonContent({ runId, videoUrl: finalVideoUrl(deps.publicBaseUrl, runId), dryRun: true });
        }
        const task = await deps.mptClient.getTask(runId);
        if (!task) {
          return errorContent("not_found", "Run not found", { runId });
        }
        if (task.status !== "completed" || task.videos.length === 0) {
          return errorContent("not_ready", `Run is ${task.status}: no final video yet`, { runId, status: task.status });
        }
        return jsonContent({ runId: task.taskId, videoUrl: finalVideoUrl(deps.publicBaseUrl, task.taskId) });
      }),
  );
}
