import type { RuntimeAgentId } from "@/runtime/types";
import type { TaskAutoReviewMode } from "@/types";

export type SelectedAgentId = RuntimeAgentId | "unknown";

interface TaskEventMap {
	task_created: {
		selected_agent_id: SelectedAgentId;
		start_in_plan_mode: boolean;
		auto_review_mode?: TaskAutoReviewMode;
		prompt_character_count: number;
	};
	task_dependency_created: Record<string, never>;
	tasks_auto_started_from_dependency: {
		started_task_count: number;
	};
	task_resumed_from_trash: Record<string, never>;
}

export function toSelectedAgentId(agentId: RuntimeAgentId | null | undefined): SelectedAgentId {
	return agentId ?? "unknown";
}

function captureTaskEvent<EventName extends keyof TaskEventMap>(
	_eventName: EventName,
	_properties: TaskEventMap[EventName],
): void {
	// Keep the existing call sites stable without emitting external events.
}

export function trackTaskCreated(properties: TaskEventMap["task_created"]): void {
	captureTaskEvent("task_created", properties);
}

export function trackTaskDependencyCreated(): void {
	captureTaskEvent("task_dependency_created", {});
}

export function trackTasksAutoStartedFromDependency(startedTaskCount: number): void {
	captureTaskEvent("tasks_auto_started_from_dependency", {
		started_task_count: startedTaskCount,
	});
}

export function trackTaskResumedFromTrash(): void {
	captureTaskEvent("task_resumed_from_trash", {});
}
