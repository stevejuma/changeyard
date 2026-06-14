/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module "virtual:changeyard-vcs-route" {
	import type { ReactElement } from "react";

	export default function VcsRoute(): ReactElement;
}
