import type { MptClient } from "../../mpt/client.js";

export function fakeMptClient(overrides: Partial<MptClient> = {}): MptClient {
  return {
    createVideo: async () => ({ taskId: "task-1" }),
    getTask: async () => null,
    resolveFinalFilePath: async () => null,
    fetchFinalVideoBuffer: async () => null,
    ...overrides,
  } as unknown as MptClient;
}
