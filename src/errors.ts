export class ChangeyardError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ChangeyardError";
    this.code = code;
  }
}

const exitByCode: Record<string, number> = {
  CONFIG_INVALID: 2,
  PROVIDER_CONFIG_INVALID: 3,
  PROVIDER_REQUEST_FAILED: 3,
  INVALID_TRANSITION: 4,
  WORKSPACE_ENGINE_FAILED: 5,
  REVIEW_COMMENT_INVALID: 6,
  CHANGEYARD_ERROR: 1,
};

export function errorCode(error: unknown): string {
  return error instanceof ChangeyardError ? error.code : "CHANGEYARD_ERROR";
}

export function errorExitCode(error: unknown): number {
  const code = errorCode(error);
  return Object.hasOwn(exitByCode, code) ? exitByCode[code] : 1;
}
