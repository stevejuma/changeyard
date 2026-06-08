export class ChangeyardError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ChangeyardError";
    this.code = code;
  }
}

export function errorCode(error: unknown): string {
  return error instanceof ChangeyardError ? error.code : "CHANGEYARD_ERROR";
}
