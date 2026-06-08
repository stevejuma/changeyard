import { CircleDot, ExternalLink, FileDiff, FolderKanban, GitBranch, Pencil, Play, RefreshCw, ShieldCheck, SquareTerminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Board, Card, CardDetail, WorkspaceView } from "./types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function columnTone(id: string): string {
  switch (id) {
    case "backlog":
      return "var(--color-status-blue)";
    case "ready":
      return "var(--color-status-cyan)";
    case "in_progress":
      return "var(--color-status-gold)";
    case "review":
      return "var(--color-status-purple)";
    case "done":
      return "var(--color-status-green)";
    case "abandoned":
      return "var(--color-status-red)";
    default:
      return "var(--color-text-tertiary)";
  }
}

function sectionOrder(sections: Record<string, string>): Array<[string, string]> {
  return Object.entries(sections).sort(([left], [right]) => left.localeCompare(right));
}

export default function App(): React.ReactElement {
  const [board, setBoard] = useState<Board | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"diff" | "terminal">("diff");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const cards = useMemo(() => board?.columns.flatMap((column) => column.cards) ?? [], [board]);

  async function loadBoard(nextSelectedId?: string | null): Promise<void> {
    const nextBoard = await fetchJson<Board>("/api/board");
    setBoard(nextBoard);
    const targetId = nextSelectedId ?? selectedId ?? nextBoard.columns.flatMap((column) => column.cards)[0]?.id ?? null;
    if (targetId) {
      await loadCard(targetId);
    } else {
      setSelectedId(null);
      setSelectedCard(null);
      setWorkspaceView(null);
    }
  }

  async function loadCard(id: string): Promise<void> {
    setSelectedId(id);
    const detail = await fetchJson<CardDetail>(`/api/cards/${encodeURIComponent(id)}`);
    setSelectedCard(detail);
    if (detail.workspace?.path) {
      const nextWorkspaceView = await fetchJson<WorkspaceView>(`/api/cards/${encodeURIComponent(id)}/workspace-view`);
      setWorkspaceView(nextWorkspaceView);
    } else {
      setWorkspaceView(null);
    }
  }

  async function runAction(action: string, card: CardDetail): Promise<void> {
    setPendingAction(action);
    setError(null);
    try {
      if (action === "create") {
        const title = window.prompt("Task title");
        if (!title) return;
        const created = await fetchJson<CardDetail>("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, template: "agent-task" }),
        });
        await loadBoard(created.id);
        return;
      }
      if (action === "refresh") {
        await loadBoard();
        return;
      }
      if (action === "edit-metadata") {
        const title = window.prompt("Task title", card.title);
        if (title === null) return;
        const priority = window.prompt("Priority", card.priority ?? "");
        if (priority === null) return;
        const labels = window.prompt("Labels (comma separated)", card.labels.join(", "));
        if (labels === null) return;
        await fetchJson(`/api/cards/${encodeURIComponent(card.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            priority: priority.trim() ? priority : null,
            labels: labels.split(",").map((label) => label.trim()).filter(Boolean),
          }),
        });
        await loadBoard(card.id);
        return;
      }
      if (action.startsWith("edit-section:")) {
        const sectionName = action.slice("edit-section:".length);
        const currentContent = card.sections?.[sectionName] ?? "";
        const content = window.prompt(`${sectionName} section`, currentContent);
        if (content === null) return;
        await fetchJson(`/api/cards/${encodeURIComponent(card.id)}/sections/${encodeURIComponent(sectionName)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        await loadBoard(card.id);
        return;
      }
      if (action === "complete-pr") {
        await fetchJson(`/api/cards/${encodeURIComponent(card.id)}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ withPr: true }),
        });
      } else if (action === "review-approve") {
        await fetchJson(`/api/cards/${encodeURIComponent(card.id)}/review/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approve" }),
        });
      } else if (action === "review-request-changes") {
        await fetchJson(`/api/cards/${encodeURIComponent(card.id)}/review/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "request-changes" }),
        });
      } else {
        await fetchJson(`/api/cards/${encodeURIComponent(card.id)}/${action}`, { method: "POST" });
      }
      await loadBoard(card.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setPendingAction(null);
    }
  }

  useEffect(() => {
    void loadBoard().catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, []);

  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("board-invalidated", () => {
      void loadBoard(selectedId).catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
    });
    return () => events.close();
  }, [selectedId]);

  function actionButtons(card: CardDetail): Array<{ id: string; label: string }> {
    const buttons: Array<{ id: string; label: string }> = [{ id: "edit-metadata", label: "Edit" }];
    if (card.status === "ready") buttons.push({ id: "sync", label: "Sync" });
    if (["ready", "synced", "changes_requested"].includes(card.status)) buttons.push({ id: "start", label: "Start" });
    if (card.status === "in_progress") {
      buttons.push({ id: "complete", label: "Complete" });
      buttons.push({ id: "complete-pr", label: "Draft PR" });
    }
    if (["ready_for_pr", "pr_open", "in_review"].includes(card.status)) {
      buttons.push({ id: "review-start", label: "Review" });
      buttons.push({ id: "review-approve", label: "Approve" });
      buttons.push({ id: "review-request-changes", label: "Request Changes" });
    }
    return buttons;
  }

  return (
    <div className="min-h-screen bg-surface-0 text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-1/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-bright bg-surface-2">
              <FolderKanban size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">Changeyard</div>
              <div className="truncate text-sm font-semibold">Kanban Runtime</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="kb-btn kb-btn-secondary" onClick={() => void runAction("refresh", selectedCard ?? (cards[0] as CardDetail))}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <button className="kb-btn kb-btn-primary" onClick={() => void runAction("create", selectedCard ?? (cards[0] as CardDetail))}>
              <Play size={14} />
              New Task
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1680px] grid-cols-[minmax(0,1.65fr)_minmax(360px,0.95fr)] gap-4 px-4 py-4 max-[1100px]:grid-cols-1">
        <section className="flex min-h-[calc(100vh-112px)] min-w-0 flex-col rounded-lg border border-border bg-surface-1">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <CircleDot size={14} className="text-accent" />
              <span className="text-sm font-medium">Board</span>
              {board ? <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">{board.workspaceEngine}</span> : null}
            </div>
            <div className="text-xs text-text-tertiary">{cards.length} cards</div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3 overflow-auto p-3">
            {board?.columns.map((column) => (
              <section key={column.id} className="flex min-h-[420px] min-w-0 flex-col rounded-lg border border-border bg-surface-2">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: columnTone(column.id) }} />
                    <span className="text-sm font-semibold">{column.title}</span>
                  </div>
                  <span className="text-xs text-text-tertiary">{column.cards.length}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-auto p-2">
                  {column.cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className={`kb-card ${selectedId === card.id ? "kb-card-selected" : ""}`}
                      onClick={() => void loadCard(card.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-text-tertiary">
                            <span>{card.id}</span>
                            <span>{card.status}</span>
                          </div>
                          <div className="line-clamp-2 text-left text-sm font-semibold">{card.title}</div>
                        </div>
                        <Pencil size={14} className="shrink-0 text-text-tertiary" />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                        <span className="rounded-full border border-border px-2 py-0.5">{card.type}</span>
                        {card.workspace?.engine ? <span className="rounded-full border border-border px-2 py-0.5">{card.workspace.engine}</span> : null}
                        {card.provider?.type ? <span className="rounded-full border border-border px-2 py-0.5">{card.provider.type}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <aside className="min-h-[calc(100vh-112px)] overflow-auto rounded-lg border border-border bg-surface-1">
          {selectedCard ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-border px-4 py-4">
                <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-text-tertiary">{selectedCard.id}</div>
                <div className="mb-4 text-lg font-semibold">{selectedCard.title}</div>
                <div className="flex flex-wrap gap-2">
                  {actionButtons(selectedCard).map((action) => (
                    <button
                      key={action.id}
                      className={`kb-btn ${action.id === "complete-pr" ? "kb-btn-secondary" : "kb-btn-default"}`}
                      disabled={pendingAction === action.id}
                      onClick={() => void runAction(action.id, selectedCard)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>

              {error ? (
                <div className="mx-4 mt-4 rounded-md border border-status-red/30 bg-status-red/10 px-3 py-2 text-sm text-status-red">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-4 p-4">
                <section className="rounded-lg border border-border bg-surface-2 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck size={14} />
                    Overview
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Status</dt>
                      <dd>{selectedCard.status}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Priority</dt>
                      <dd>{selectedCard.priority ?? "n/a"}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Labels</dt>
                      <dd>{selectedCard.labels.join(", ") || "none"}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Path</dt>
                      <dd className="break-all">{selectedCard.path}</dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-lg border border-border bg-surface-2 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <GitBranch size={14} />
                    Workspace
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Engine</dt>
                      <dd>{selectedCard.workspace?.engine ?? "not started"}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Path</dt>
                      <dd className="break-all">{selectedCard.workspace?.path ?? "not started"}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Branch</dt>
                      <dd>{selectedCard.workspace?.branch ?? "n/a"}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Verification</dt>
                      <dd>
                        {selectedCard.workspace?.verification
                          ? (selectedCard.workspace.verification.valid ? "valid" : selectedCard.workspace.verification.errors.join("; "))
                          : "not checked"}
                      </dd>
                    </div>
                  </dl>
                </section>

                {workspaceView ? (
                  <section className="rounded-lg border border-border bg-surface-2 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <SquareTerminal size={14} />
                        Workspace Runtime
                      </div>
                      <div className="flex gap-1">
                        <button className={`kb-tab ${workspaceTab === "diff" ? "kb-tab-active" : ""}`} onClick={() => setWorkspaceTab("diff")}>
                          <FileDiff size={13} />
                          Diff
                        </button>
                        <button className={`kb-tab ${workspaceTab === "terminal" ? "kb-tab-active" : ""}`} onClick={() => setWorkspaceTab("terminal")}>
                          <SquareTerminal size={13} />
                          Terminal
                        </button>
                      </div>
                    </div>
                    <div className="mb-2 text-xs text-text-tertiary">{workspaceView.engine} workspace at {workspaceView.path}</div>
                    <pre className="kb-code">
                      {workspaceTab === "diff"
                        ? workspaceView.diffOutput || "No diff output."
                        : [`$ ${workspaceView.commands.join("\n$ ")}`, "", workspaceView.statusOutput, workspaceView.checkLog ? `\n# checks.log\n\n${workspaceView.checkLog}` : ""].join("\n").trim()}
                    </pre>
                  </section>
                ) : null}

                <section className="rounded-lg border border-border bg-surface-2 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ExternalLink size={14} />
                    Provider
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Provider</dt>
                      <dd>{selectedCard.provider?.type ?? "none"}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Issue</dt>
                      <dd>{selectedCard.provider?.issueUrl ? <a className="kb-link" href={selectedCard.provider.issueUrl} target="_blank" rel="noreferrer">{selectedCard.provider.issueUrl}</a> : "n/a"}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-[11px] uppercase tracking-[0.14em] text-text-tertiary">Pull Request</dt>
                      <dd>{selectedCard.provider?.pullRequestUrl ? <a className="kb-link" href={selectedCard.provider.pullRequestUrl} target="_blank" rel="noreferrer">{selectedCard.provider.pullRequestUrl}</a> : "n/a"}</dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-lg border border-border bg-surface-2 p-4">
                  <div className="mb-3 text-sm font-semibold">Markdown Sections</div>
                  <div className="grid gap-3">
                    {sectionOrder(selectedCard.sections).map(([name, content]) => (
                      <article key={name} className="rounded-md border border-border bg-surface-1 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{name}</div>
                          <button className="kb-btn kb-btn-secondary" onClick={() => void runAction(`edit-section:${name}`, selectedCard)}>
                            Edit
                          </button>
                        </div>
                        <pre className="kb-code">{content || "(empty)"}</pre>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-text-secondary">
              Select a card to inspect its changeyard document, workspace state, and provider artifacts.
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
