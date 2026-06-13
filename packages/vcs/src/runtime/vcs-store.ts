import { configureStore } from "@reduxjs/toolkit";

import { vcsApi } from "@/runtime/vcs-api";

export const vcsStore = configureStore({
	reducer: {
		[vcsApi.reducerPath]: vcsApi.reducer,
	},
	middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(vcsApi.middleware),
});

export type VcsStoreDispatch = typeof vcsStore.dispatch;
