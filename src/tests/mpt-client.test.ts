import { describe, expect, it, vi } from "vitest";
import { MptClient, MptClientError, stripTaskUriPrefix } from "../mpt/client.js";

function fakeFetch(response: { status: number; body: unknown }) {
  return vi.fn(async () => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  })) as unknown as typeof fetch;
}

describe("MptClient.createVideo", () => {
  it("posts to /api/v1/videos with the x-api-key header, not Authorization", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { status: 200, data: { task_id: "task-1" } } });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    await client.createVideo({ video_subject: "cats" });

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://mpt.local/api/v1/videos");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("forces video_count to 1 even when the caller passes a different value", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { status: 200, data: { task_id: "task-1" } } });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    await client.createVideo({ video_subject: "cats", video_count: 5 });

    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.video_count).toBe(1);
  });

  it("unwraps data.task_id from MPT's response envelope", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { status: 200, data: { task_id: "abc-123" } } });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const result = await client.createVideo({ video_subject: "cats" });

    expect(result).toEqual({ taskId: "abc-123" });
  });

  it("throws MptClientError with MPT's message on a non-2xx response", async () => {
    const fetchImpl = fakeFetch({ status: 429, body: { status: 429, message: "queue is full" } });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    await expect(client.createVideo({ video_subject: "cats" })).rejects.toMatchObject(
      new MptClientError(429, "queue is full"),
    );
  });
});

describe("MptClient.getTask", () => {
  it("unwraps data and maps MPT's numeric state to the closed job-status vocabulary", async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: { status: 200, data: { task_id: "task-1", state: 4, videos: [] } },
    });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const task = await client.getTask("task-1");

    expect(task).toMatchObject({ taskId: "task-1", status: "running" });
  });

  it.each([
    [1, "completed"],
    [-1, "failed"],
    [4, "running"],
  ])("maps MPT state %i to %s", async (state, expected) => {
    const fetchImpl = fakeFetch({ status: 200, body: { status: 200, data: { task_id: "t", state, videos: [] } } });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const task = await client.getTask("t");

    expect(task?.status).toBe(expected);
  });

  it("returns null on a 404 (task not found), instead of throwing", async () => {
    const fetchImpl = fakeFetch({ status: 404, body: { status: 404, message: "task not found" } });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const task = await client.getTask("missing");

    expect(task).toBeNull();
  });
});

describe("MptClient.resolveFinalFilePath", () => {
  it("reads videos[0], not combined_videos[0] (the finished, subtitled/mixed video)", async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        status: 200,
        data: {
          task_id: "task-1",
          state: 1,
          videos: ["/tasks/task-1/final-1.mp4"],
          combined_videos: ["/tasks/task-1/combined-1.mp4"],
        },
      },
    });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const filePath = await client.resolveFinalFilePath("task-1");

    expect(filePath).toBe("task-1/final-1.mp4");
  });

  it("returns null when the task has no videos yet", async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: { status: 200, data: { task_id: "task-1", state: 4, videos: [] } },
    });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const filePath = await client.resolveFinalFilePath("task-1");

    expect(filePath).toBeNull();
  });
});

describe("MptClient.fetchFinalVideoBuffer", () => {
  function fetchImplFor(filePath: string, streamResponse: { ok: boolean; status: number; body: Buffer; contentType?: string }) {
    return vi.fn(async (url: string) => {
      if (url.includes("/api/v1/tasks/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 200, data: { task_id: "task-1", state: 1, videos: [`/tasks/${filePath}`] } }),
        };
      }
      return {
        ok: streamResponse.ok,
        status: streamResponse.status,
        arrayBuffer: async () =>
          streamResponse.body.buffer.slice(
            streamResponse.body.byteOffset,
            streamResponse.body.byteOffset + streamResponse.body.byteLength,
          ),
        headers: { get: (name: string) => (name === "Content-Type" ? streamResponse.contentType ?? null : null) },
      };
    }) as unknown as typeof fetch;
  }

  it("streams GET /api/v1/stream/{filePath} with x-api-key and buffers the body", async () => {
    const fetchImpl = fetchImplFor("task-1/final-1.mp4", { ok: true, status: 200, body: Buffer.from("video-bytes"), contentType: "video/mp4" });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const video = await client.fetchFinalVideoBuffer("task-1");

    expect(video).not.toBeNull();
    expect(video!.buffer.toString()).toBe("video-bytes");
    expect(video!.contentType).toBe("video/mp4");

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://mpt.local/api/v1/stream/task-1/final-1.mp4");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("secret");
  });

  it("returns null when the task has no final video yet", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 200, data: { task_id: "task-1", state: 4, videos: [] } }),
    })) as unknown as typeof fetch;
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    const video = await client.fetchFinalVideoBuffer("task-1");

    expect(video).toBeNull();
  });

  it("throws MptClientError when the upstream stream request fails", async () => {
    const fetchImpl = fetchImplFor("task-1/final-1.mp4", { ok: false, status: 502, body: Buffer.from("") });
    const client = new MptClient({ baseUrl: "http://mpt.local", apiKey: "secret", fetchImpl });

    await expect(client.fetchFinalVideoBuffer("task-1")).rejects.toThrow(MptClientError);
  });
});

describe("stripTaskUriPrefix", () => {
  it("strips a bare /tasks/ prefix (no endpoint configured on MPT)", () => {
    expect(stripTaskUriPrefix("/tasks/task-1/final-1.mp4")).toBe("task-1/final-1.mp4");
  });

  it("strips an endpoint-prefixed /tasks/ URI", () => {
    expect(stripTaskUriPrefix("https://mpt.example.com/tasks/task-1/final-1.mp4")).toBe(
      "task-1/final-1.mp4",
    );
  });
});
