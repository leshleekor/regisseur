import { spawn } from "node:child_process";

import type {
  CliExecutionRequest,
  CliTransportPort,
  CliTransportResult,
} from "@regisseur/adapter-cli";
import type {
  HttpExecutionRequest,
  HttpTransportPort,
  HttpTransportResult,
} from "@regisseur/adapter-http";
import type {
  OpenClawExecutionRequest,
  OpenClawTransportPort,
  OpenClawTransportResult,
} from "@regisseur/adapter-openclaw";

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function mergeProcessEnv(
  env: Record<string, string> | undefined,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

async function executeProcessCommand(
  command: string,
  args: readonly string[],
  stdinText: string,
  options: {
    workingDirectory?: string;
    env?: Record<string, string>;
  },
): Promise<
  | {
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
    }
  | {
      ok: false;
      message: string;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    }
> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (
      result:
        | {
            ok: true;
            stdout: string;
            stderr: string;
            exitCode: number;
          }
        | {
            ok: false;
            message: string;
            stdout?: string;
            stderr?: string;
            exitCode?: number;
          },
    ) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    let child;

    try {
      child = spawn(command, [...args], {
        cwd: options.workingDirectory,
        env: mergeProcessEnv(options.env),
        stdio: "pipe",
      });
    } catch (error) {
      settle({
        ok: false,
        message: resolveErrorMessage(error, `Failed to start ${command}`),
      });
      return;
    }

    child.on("error", (error) => {
      settle({
        ok: false,
        message: resolveErrorMessage(error, `Failed to execute ${command}`),
        stdout,
        stderr,
      });
    });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      settle({
        ok: true,
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    child.stdin?.setDefaultEncoding("utf8");
    child.stdin?.write(stdinText);
    child.stdin?.end();
  });
}

export function createFetchHttpTransport(
  fetchImpl: typeof fetch = fetch,
): HttpTransportPort {
  return {
    async execute(request: HttpExecutionRequest): Promise<HttpTransportResult> {
      const headers = { ...request.headers };
      const hasContentType = Object.keys(headers).some(
        (headerName) => headerName.toLowerCase() === "content-type",
      );

      if (!hasContentType) {
        headers["content-type"] = "application/json";
      }

      const controller =
        request.timeoutMs === undefined ? undefined : new AbortController();
      const timeoutId =
        controller === undefined
          ? undefined
          : setTimeout(() => controller.abort(), request.timeoutMs);

      try {
        const response = await fetchImpl(request.url, {
          method: request.method,
          headers,
          body: JSON.stringify(request.body),
          signal: controller?.signal,
        });
        const bodyText = await response.text();

        return {
          ok: true,
          status: response.status,
          bodyText,
          headers: Object.fromEntries(response.headers.entries()),
        };
      } catch (error) {
        return {
          ok: false,
          message: resolveErrorMessage(error, "HTTP transport failed"),
        };
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    },
  };
}

export function createCliProcessTransport(): CliTransportPort {
  return {
    async execute(request: CliExecutionRequest): Promise<CliTransportResult> {
      return executeProcessCommand(
        request.command,
        request.args,
        JSON.stringify(request.stdinInput),
        {
          workingDirectory: request.workingDirectory,
          env: request.env,
        },
      );
    },
  };
}

export function createOpenClawProcessTransport(): OpenClawTransportPort {
  return {
    async execute(
      request: OpenClawExecutionRequest,
    ): Promise<OpenClawTransportResult> {
      return executeProcessCommand(
        request.command,
        request.args,
        JSON.stringify(request.input),
        {
          workingDirectory: request.workingDirectory,
          env: request.env,
        },
      );
    },
  };
}
