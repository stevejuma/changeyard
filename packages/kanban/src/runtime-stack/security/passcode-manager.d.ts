/**
 * Passcode manager for remotely-hosted Kanban instances.
 *
 * Security properties:
 * - Passcode is generated via crypto.randomBytes — cryptographically secure.
 * - Passcode lives in-memory only — never written to disk, never in env vars.
 * - Each process has its own independent passcode.
 * - Comparison uses crypto.timingSafeEqual to prevent timing attacks.
 * - Sessions are random tokens stored in-memory with TTL metadata.
 * - Rate limiting: 5 failed attempts triggers a 30-second lockout.
 * - Passcode is NEVER returned in any response, log, or error message.
 */
declare const INTERNAL_TOKEN_ENV = "KANBAN_INTERNAL_AUTH_TOKEN";
/**
 * Generate a new passcode. Called once at server startup when remote mode is active.
 * Returns the plaintext passcode for console display ONLY.
 */
export declare function generatePasscode(): string;
/** Disable passcode enforcement (--no-passcode flag). */
export declare function disablePasscode(): void;
/** Whether passcode enforcement is currently active. */
export declare function isPasscodeEnabled(): boolean;
/**
 * Revoke the current passcode and generate a new one.
 * Returns the new plaintext passcode for display.
 */
export declare function revokeAndRegeneratePasscode(): string;
/**
 * Validate a submitted passcode. Uses timing-safe comparison.
 */
export declare function validatePasscode(submitted: string): boolean;
/** Issue a new session token after successful passcode verification. */
export declare function issueSession(): string;
/** Validate a session token. Returns true if valid and not expired. */
export declare function validateSession(token: string): boolean;
/** Extract the session token from a Cookie header string. */
export declare function extractSessionTokenFromCookie(cookieHeader: string | undefined): string | null;
export interface RateLimitResult {
    allowed: boolean;
    lockedUntilMs: number | null;
    attemptsRemaining: number;
}
/** Check rate limit for a given IP address before a passcode attempt. */
export declare function checkRateLimit(ip: string): RateLimitResult;
/** Record a failed passcode attempt for rate limiting. */
export declare function recordFailedAttempt(ip: string): void;
/** Clear rate limit for a given IP after a successful verification. */
export declare function clearRateLimit(ip: string): void;
/**
 * Generate (or regenerate) the internal CLI auth token.
 * Called by the server at startup when remote-mode passcode is active.
 * The token is stored in-memory and written to `process.env` so that
 * child processes inherit it.
 */
export declare function generateInternalToken(): string;
/**
 * Return the current internal token, reading from the env var if needed
 * (this covers CLI sub-processes that were spawned by the server).
 */
export declare function getInternalToken(): string | null;
/**
 * Validate an internal bearer token.  Uses timing-safe comparison.
 * Returns `true` if the submitted token matches the active internal token.
 */
export declare function validateInternalToken(submitted: string): boolean;
/**
 * Extract a bearer token from an Authorization header value.
 * Returns the raw token string or `null` if the header is absent / malformed.
 */
export declare function extractBearerToken(authorizationHeader: string | undefined): string | null;
/** Name of the env var used to propagate the internal token to child processes. */
export { INTERNAL_TOKEN_ENV };
