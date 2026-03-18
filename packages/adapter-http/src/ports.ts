import type { HttpExecutionRequest, HttpTransportResult } from "./types.js";

export interface HttpTransportPort {
  execute(request: HttpExecutionRequest): Promise<HttpTransportResult>;
}
