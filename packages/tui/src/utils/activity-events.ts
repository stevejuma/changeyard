export type ActivityEventKind =
  | "refresh"
  | "runtime-event"
  | "lifecycle"
  | "create"
  | "doctor"
  | "setup"
  | "export"
  | "error";

export type ActivityEventStatus = "started" | "success" | "failure" | "info";

export type ActivityEvent = {
  id: string;
  kind: ActivityEventKind;
  status: ActivityEventStatus;
  title: string;
  description: string;
  createdAt: string;
  changeId?: string;
};

export type ActivityEventDraft = Omit<ActivityEvent, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export const ACTIVITY_EVENT_LIMIT = 100;

export function normalizeActivityEvents(value: unknown): ActivityEvent[] {
  if (!Array.isArray(value)) return [];
  const events: ActivityEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<ActivityEvent>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.kind !== "string" ||
      typeof candidate.status !== "string" ||
      typeof candidate.title !== "string" ||
      typeof candidate.description !== "string" ||
      typeof candidate.createdAt !== "string"
    ) {
      continue;
    }
    events.push({
      id: candidate.id,
      kind: candidate.kind as ActivityEventKind,
      status: candidate.status as ActivityEventStatus,
      title: candidate.title,
      description: candidate.description,
      createdAt: candidate.createdAt,
      ...(typeof candidate.changeId === "string" ? { changeId: candidate.changeId } : {}),
    });
  }
  return events.slice(0, ACTIVITY_EVENT_LIMIT);
}

export function createActivityEvent(draft: ActivityEventDraft, now = new Date()): ActivityEvent {
  const createdAt = draft.createdAt ?? now.toISOString();
  const suffix = `${createdAt}:${draft.kind}:${draft.status}:${draft.changeId ?? ""}:${draft.title}`;
  return {
    ...draft,
    id: draft.id ?? `event:${hashEventSuffix(suffix)}`,
    createdAt,
  };
}

export function prependActivityEvent(
  history: readonly ActivityEvent[],
  eventOrDraft: ActivityEvent | ActivityEventDraft,
): ActivityEvent[] {
  const event = "createdAt" in eventOrDraft && "id" in eventOrDraft
    ? eventOrDraft as ActivityEvent
    : createActivityEvent(eventOrDraft);
  const deduped = history.filter((item) => item.id !== event.id);
  return [event, ...deduped].slice(0, ACTIVITY_EVENT_LIMIT);
}

function hashEventSuffix(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
