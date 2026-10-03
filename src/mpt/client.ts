import { stripTrailingSlash } from "../util.js";

// Thin HTTP client for an already-running, separately-deployed
// MoneyPrinterTurbo (MPT) instance -- see CONTEXT.md. This server holds no
// local job state: `getTask`/`resolveFinalFilePath` re-query MPT live on
// every call rather than reading a cache.

export type JobStatus = "pending" | "running" | "completed" | "failed";

const MPT_STATE_FAILED = -1;
const MPT_STATE_COMPLETE = 1;
const MPT_STATE_PROCESSING = 4;

export function mapMptState(state: number): JobStatus {
  switch (state) {
    case MPT_STATE_COMPLETE:
      return "completed";
    case MPT_STATE_FAILED:
      return "failed";
    case MPT_STATE_PROCESSING:
      return "running";
    default:
      // MPT's state int space isn't formally closed on this side -- treat
      // anything unrecognized as still in flight rather than throwing.
      return "running";
  }
}

// MPT wraps every response in {status, data?, message?} (see
// app/utils/utils.py get_response); a non-2xx status carries `message`
// instead of `data`.
interface MptEnvelope<T> {
  status: number;
  data?: T;
  message?: string;
}

// The MCP tool layer only ever needs a closed error category (mirroring the
// closed job-status vocabulary above) -- HTTP-status-code knowledge about
// MPT belongs here, at the boundary that already owns MPT's wire format,
// not re-derived a second time in the tool layer.
export type MptErrorCategory = "rate_limit" | "validation" | "provider_error";

function categorizeStatus(status: number): MptErrorCategory {
  if (status === 429) return "rate_limit";
  if (status === 400) return "validation";
  return "provider_error";
}

export class MptClientError extends Error {
  readonly status: number;
  readonly category: MptErrorCategory;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.category = categorizeStatus(status);
  }
}

export interface MptTaskStatus {
  taskId: string;
  status: JobStatus;
  videos: string[];
}

export interface MptClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

const TASKS_URI_MARKER = "/tasks/";

// MPT emits video paths as either "/tasks/<rel>" (no `endpoint` configured
// on MPT's side) or "{endpoint}/tasks/<rel>" (see _task_file_to_uri in
// app/controllers/v1/video.py). GET /api/v1/stream/{file_path} expects the
// bare <rel> part.
export function stripTaskUriPrefix(uri: string): string {
  const idx = uri.indexOf(TASKS_URI_MARKER);
  if (idx === -1) return uri;
  return uri.slice(idx + TASKS_URI_MARKER.length);
}

export class MptClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MptClientOptions) {
    this.baseUrl = stripTrailingSlash(options.baseUrl);
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", "x-api-key": this.apiKey };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<{ res: Response; body: MptEnvelope<T> | undefined }> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers as Record<string, string> | undefined) },
    });
    const body = (await res.json().catch(() => undefined)) as MptEnvelope<T> | undefined;
    return { res, body };
  }

  async createVideo(params: Record<string, unknown>): Promise<{ taskId: string }> {
    // video_count is forced here, not left to the caller: every unit of
    // video_count is a complete independent final video, not a clip to
    // merge (see CONTEXT.md) -- one produce_video call must mean one video.
    const body = { ...params, video_count: 1 };
    const { res, body: envelope } = await this.request<{ task_id: string }>("/api/v1/videos", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new MptClientError(res.status, envelope?.message ?? `MoneyPrinterTurbo request failed with status ${res.status}`);
    }
    const taskId = envelope?.data?.task_id;
    if (typeof taskId !== "string") {
      throw new MptClientError(res.status, "MoneyPrinterTurbo response missing data.task_id");
    }
    return { taskId };
  }

  async getTask(taskId: string): Promise<MptTaskStatus | null> {
    const { res, body: envelope } = await this.request<{ task_id: string; state: number; videos?: string[] }>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new MptClientError(res.status, envelope?.message ?? `MoneyPrinterTurbo request failed with status ${res.status}`);
    }
    const data = envelope?.data;
    return {
      taskId,
      status: mapMptState(data?.state ?? MPT_STATE_PROCESSING),
      videos: Array.isArray(data?.videos) ? data.videos : [],
    };
  }

  async resolveFinalFilePath(taskId: string): Promise<string | null> {
    const task = await this.getTask(taskId);
    const uri = task?.videos[0];
    if (!uri) return null;
    return stripTaskUriPrefix(uri);
  }

  // Same upstream call as GET /videos/:runId/final (routes/videos.ts), but
  // buffered instead of streamed in passthrough: /publish needs the full
  // bytes to multipart-upload to Postiz, routes/videos.ts only needs to
  // relay a <video> tag's request.
  async fetchFinalVideoBuffer(taskId: string): Promise<{ buffer: Buffer; contentType?: string } | null> {
    const filePath = await this.resolveFinalFilePath(taskId);
    if (!filePath) return null;

    const res = await this.fetchImpl(`${this.baseUrl}/api/v1/stream/${filePath}`, {
      headers: { "x-api-key": this.apiKey },
    });
    if (!res.ok) {
      throw new MptClientError(res.status, `MoneyPrinterTurbo stream request failed with status ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("Content-Type") ?? undefined;
    return { buffer, contentType };
  }
}
