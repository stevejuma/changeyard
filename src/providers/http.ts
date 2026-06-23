import { spawnSync } from "node:child_process";
import { ChangeyardError } from "../errors.js";

export type HttpRequest = {
  method: string;
  url: string;
  token: string;
  tokenScheme?: "token" | "Bearer";
  payload?: object;
  accept?: string;
  extraHeaders?: string[];
  followRedirects?: boolean;
};

export type HttpResponse = {
  status: number;
  body: string;
};

export type HttpTransport = (request: HttpRequest) => HttpResponse;

let transport: HttpTransport = curlTransport;

function curlTransport(request: HttpRequest): HttpResponse {
  const auth = request.tokenScheme === "Bearer" ? `Bearer ${request.token}` : `token ${request.token}`;
  const args = [
    "-sS",
    ...(request.followRedirects ? ["-L"] : []),
    "-X",
    request.method,
    "-H",
    `Authorization: ${auth}`,
    ...(request.accept ? ["-H", `Accept: ${request.accept}`] : []),
    ...(request.payload === undefined ? [] : ["-H", "Content-Type: application/json"]),
    ...(request.extraHeaders ?? []).flatMap((header) => ["-H", header]),
    ...(request.payload === undefined ? [] : ["-d", JSON.stringify(request.payload)]),
    "-w",
    "\n%{http_code}",
    request.url,
  ];
  const result = spawnSync("curl", args, { encoding: "utf8" });
  if (result.status !== 0) throw new ChangeyardError("PROVIDER_REQUEST_FAILED", result.stderr || `curl failed for ${request.url}`);

  const output = result.stdout || "";
  const separator = output.lastIndexOf("\n");
  const body = separator === -1 ? output : output.slice(0, separator);
  const statusText = separator === -1 ? "0" : output.slice(separator + 1).trim();
  const status = Number(statusText);
  if (!Number.isInteger(status) || status <= 0) throw new ChangeyardError("PROVIDER_REQUEST_FAILED", `curl returned an invalid HTTP status for ${request.url}`);
  return { status, body };
}

export function setHttpTransportForTests(next?: HttpTransport): void {
  transport = next ?? curlTransport;
}

function responseErrorMessage(request: HttpRequest, response: HttpResponse): string {
  const status = `HTTP ${response.status}`;
  if (!response.body.trim()) return `${status} from ${request.url}`;
  try {
    const parsed = JSON.parse(response.body) as { message?: unknown; error?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message : typeof parsed.error === "string" ? parsed.error : response.body;
    return `${status} from ${request.url}: ${message}`;
  } catch {
    return `${status} from ${request.url}: ${response.body}`;
  }
}

export function curlJson(request: HttpRequest): any {
  const response = transport(request);
  if (response.status < 200 || response.status >= 300) throw new ChangeyardError("PROVIDER_REQUEST_FAILED", responseErrorMessage(request, response));
  if (!response.body.trim()) return {};
  try {
    return JSON.parse(response.body);
  } catch {
    throw new ChangeyardError("PROVIDER_REQUEST_FAILED", `Provider returned invalid JSON from ${request.url}`);
  }
}

export function curlRaw(request: HttpRequest): string {
  const response = transport(request);
  if (response.status < 200 || response.status >= 300) throw new ChangeyardError("PROVIDER_REQUEST_FAILED", responseErrorMessage(request, response));
  return response.body;
}

export function curlGraphql(request: Omit<HttpRequest, "method" | "payload"> & { query: string; variables?: Record<string, unknown> }): any {
  const response = curlJson({
    method: "POST",
    url: request.url,
    token: request.token,
    tokenScheme: request.tokenScheme,
    payload: {
      query: request.query,
      variables: request.variables ?? {},
    },
    extraHeaders: request.extraHeaders,
  });
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    const message = response.errors
      .map((error: unknown) => typeof error === "object" && error !== null && "message" in error ? String((error as { message?: unknown }).message) : String(error))
      .join("; ");
    throw new ChangeyardError("PROVIDER_REQUEST_FAILED", `GraphQL request failed from ${request.url}: ${message}`);
  }
  return response.data ?? response;
}
