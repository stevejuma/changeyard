import { configureStore } from "@reduxjs/toolkit";

import { kanbanApi } from "@/runtime/kanban-api";

export const kanbanStore = configureStore({
	reducer: {
		[kanbanApi.reducerPath]: kanbanApi.reducer,
	},
	middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(kanbanApi.middleware),
});

export type KanbanStoreDispatch = typeof kanbanStore.dispatch;
