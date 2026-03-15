import type { CliExecutionRequest, CliTransportResult } from "./types.js";

export interface CliTransportPort {
  execute(request: CliExecutionRequest): Promise<CliTransportResult>;
}
