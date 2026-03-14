import type {
  OpenClawExecutionRequest,
  OpenClawTransportResult,
} from "./types.js";

export interface OpenClawTransportPort {
  execute(request: OpenClawExecutionRequest): Promise<OpenClawTransportResult>;
}
