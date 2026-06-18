export declare const DEFAULT_KANBAN_RUNTIME_HOST = "127.0.0.1";
export declare const DEFAULT_KANBAN_RUNTIME_PORT = 3484;
export declare function getKanbanRuntimeHost(): string;
export declare function setKanbanRuntimeHost(host: string): void;
export declare function parseRuntimePort(rawPort: string | undefined): number;
export declare function getKanbanRuntimePort(): number;
export declare function setKanbanRuntimePort(port: number): void;
export interface RuntimeTlsConfig {
    cert: string;
    key: string;
    ca?: string;
}
export declare function getKanbanRuntimeTls(): RuntimeTlsConfig | null;
export declare function setKanbanRuntimeTls(tls: RuntimeTlsConfig): void;
export declare function clearKanbanRuntimeTls(): void;
export declare function isKanbanRuntimeHttps(): boolean;
/**
 * Returns true when Kanban is bound to a non-localhost host, meaning it is
 * accessible to other machines on the network and passcode auth is required.
 */
export declare function isKanbanRemoteHost(): boolean;
export declare function getKanbanRuntimeOrigin(): string;
export declare function getKanbanRuntimeWsOrigin(): string;
export declare function buildKanbanRuntimeUrl(pathname: string): string;
export declare function buildKanbanRuntimeWsUrl(pathname: string): string;
export declare function getRuntimeFetch(): Promise<typeof globalThis.fetch>;
