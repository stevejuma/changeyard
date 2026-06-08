const state = {
  board: null,
  selectedId: null,
  selectedCard: null,
  selectedWorkspaceView: null,
  workspaceTab: "diff",
};

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Request failed: ${response.status}`);
  }
  return payload;
}

function cardActionMarkup(card) {
  const buttons = [
    `<button class="action-button secondary" data-action="edit-metadata" data-id="${card.id}" type="button">Edit Metadata</button>`,
  ];
  if (card.status === "ready") {
    buttons.push(`<button class="action-button" data-action="sync" data-id="${card.id}" type="button">Sync</button>`);
  }
  if (["ready", "synced", "changes_requested"].includes(card.status)) {
    buttons.push(`<button class="action-button" data-action="start" data-id="${card.id}" type="button">Start workspace</button>`);
  }
  if (card.status === "in_progress") {
    buttons.push(`<button class="action-button" data-action="complete" data-id="${card.id}" type="button">Complete (No PR)</button>`);
    buttons.push(`<button class="action-button secondary" data-action="complete-pr" data-id="${card.id}" type="button">Complete + Draft PR</button>`);
  }
  if (["ready_for_pr", "pr_open", "in_review"].includes(card.status)) {
    buttons.push(`<button class="action-button secondary" data-action="review-start" data-id="${card.id}" type="button">Start Review</button>`);
    buttons.push(`<button class="action-button" data-action="review-approve" data-id="${card.id}" type="button">Approve</button>`);
    buttons.push(`<button class="action-button secondary" data-action="review-request-changes" data-id="${card.id}" type="button">Request Changes</button>`);
  }
  return buttons.join("");
}

function normalizeLabels(input) {
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function editCardMetadata(card) {
  const nextTitle = window.prompt("Card title", card.title);
  if (nextTitle === null) return;

  const nextPriority = window.prompt("Priority (leave blank to clear)", card.priority ?? "");
  if (nextPriority === null) return;

  const nextLabels = window.prompt("Labels (comma separated)", (card.labels ?? []).join(", "));
  if (nextLabels === null) return;

  await fetchJson(`/api/cards/${encodeURIComponent(card.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: nextTitle,
      priority: nextPriority.trim() ? nextPriority : null,
      labels: normalizeLabels(nextLabels),
    }),
  });
}

async function editCardSection(card, sectionName, content) {
  const nextContent = window.prompt(`${sectionName} section`, content ?? "");
  if (nextContent === null) return;

  await fetchJson(`/api/cards/${encodeURIComponent(card.id)}/sections/${encodeURIComponent(sectionName)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: nextContent }),
  });
}

function renderWorkspacePanel() {
  if (!state.selectedWorkspaceView) return "";

  const view = state.selectedWorkspaceView;
  const activeTab = state.workspaceTab;
  const terminalOutput = [
    `$ ${view.commands.join("\n$ ")}`,
    "",
    view.statusOutput || "No status output.",
    view.checkLog ? `\n# checks.log\n\n${view.checkLog}` : "",
  ].join("\n");
  const panelBody = activeTab === "terminal"
    ? `<pre>${terminalOutput.trim()}</pre>`
    : `<pre>${view.diffOutput || "No diff output."}</pre>`;

  return `
    <section class="detail-section">
      <div class="workspace-panel-header">
        <h3>Workspace View</h3>
        <div class="tab-strip">
          <button class="tab-button ${activeTab === "diff" ? "active" : ""}" data-action="workspace-tab" data-tab="diff" type="button">Diff</button>
          <button class="tab-button ${activeTab === "terminal" ? "active" : ""}" data-action="workspace-tab" data-tab="terminal" type="button">Terminal</button>
        </div>
      </div>
      <p class="empty-state">${view.engine} workspace at ${view.path}</p>
      ${panelBody}
    </section>
  `;
}

function renderBoard() {
  const boardRoot = document.querySelector("#board");
  const engineChip = document.querySelector("#engine-chip");
  if (!state.board) {
    boardRoot.innerHTML = `<p class="empty-state">No board data loaded.</p>`;
    engineChip.textContent = "Unavailable";
    return;
  }

  engineChip.textContent = `Default engine: ${state.board.workspaceEngine}`;
  boardRoot.innerHTML = state.board.columns.map((column) => `
    <section class="column">
      <header class="column-header">
        <div>
          <h2>${column.title}</h2>
          <p>${column.statuses.join(", ")}</p>
        </div>
        <span class="column-count">${column.cards.length}</span>
      </header>
      <div class="column-cards">
        ${column.cards.map((card) => `
          <article class="card ${state.selectedId === card.id ? "selected" : ""}" data-card-id="${card.id}" tabindex="0">
            <div class="card-topline">
              <span class="card-id">${card.id}</span>
              <span class="card-status">${card.status}</span>
            </div>
            <h3>${card.title}</h3>
            <p class="card-type">${card.type}</p>
            <div class="card-meta">
              <span class="chip subtle">${card.workspace?.engine ?? "no workspace"}</span>
              ${card.provider?.type ? `<span class="chip subtle">${card.provider.type}</span>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  boardRoot.querySelectorAll("[data-card-id]").forEach((node) => {
    node.addEventListener("click", () => selectCard(node.getAttribute("data-card-id")));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCard(node.getAttribute("data-card-id"));
      }
    });
  });
}

function renderDetail() {
  const panel = document.querySelector("#detail-panel");
  if (!state.selectedCard) {
    panel.innerHTML = `
      <div class="detail-empty">
        <p>Select a card to inspect its markdown, provider links, and workspace details.</p>
      </div>
    `;
    return;
  }

  const card = state.selectedCard;
  const sections = Object.entries(card.sections ?? {});
  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${card.id}</p>
        <h2>${card.title}</h2>
      </div>
      <div class="detail-actions">${cardActionMarkup(card)}</div>
    </div>
    <section class="detail-section">
      <h3>Overview</h3>
      <dl class="facts">
        <div><dt>Status</dt><dd>${card.status}</dd></div>
        <div><dt>Type</dt><dd>${card.type}</dd></div>
        <div><dt>Priority</dt><dd>${card.priority ?? "n/a"}</dd></div>
        <div><dt>Path</dt><dd>${card.path}</dd></div>
        <div><dt>Labels</dt><dd>${(card.labels ?? []).join(", ") || "none"}</dd></div>
      </dl>
    </section>
    <section class="detail-section">
      <h3>Workspace</h3>
      <dl class="facts">
        <div><dt>Engine</dt><dd>${card.workspace?.engine ?? "not started"}</dd></div>
        <div><dt>Path</dt><dd>${card.workspace?.path ?? "not started"}</dd></div>
        <div><dt>Branch</dt><dd>${card.workspace?.branch ?? "n/a"}</dd></div>
        <div><dt>Verify</dt><dd>${card.workspace?.verification ? (card.workspace.verification.valid ? "valid" : card.workspace.verification.errors.join("; ")) : "not checked"}</dd></div>
      </dl>
    </section>
    ${renderWorkspacePanel()}
    <section class="detail-section">
      <h3>Provider</h3>
      <dl class="facts">
        <div><dt>Provider</dt><dd>${card.provider?.type ?? "none"}</dd></div>
        <div><dt>Issue</dt><dd>${card.provider?.issueUrl ? `<a href="${card.provider.issueUrl}" target="_blank" rel="noreferrer">${card.provider.issueUrl}</a>` : "n/a"}</dd></div>
        <div><dt>Pull request</dt><dd>${card.provider?.pullRequestUrl ? `<a href="${card.provider.pullRequestUrl}" target="_blank" rel="noreferrer">${card.provider.pullRequestUrl}</a>` : "n/a"}</dd></div>
      </dl>
    </section>
    <section class="detail-section">
      <h3>Markdown Sections</h3>
      ${sections.length === 0 ? `<p class="empty-state">No parsed top-level sections.</p>` : sections.map(([name, content]) => `
        <article class="section-block">
          <div class="section-header">
            <h4>${name}</h4>
            <button class="action-button secondary inline-action" data-action="edit-section" data-id="${card.id}" data-section="${name}" type="button">Edit</button>
          </div>
          <pre>${content || "(empty)"}</pre>
        </article>
      `).join("")}
    </section>
  `;

  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-action");
      const id = button.getAttribute("data-id");
      button.disabled = true;
      try {
        if (action === "edit-metadata") {
          await editCardMetadata(card);
        } else if (action === "edit-section") {
          const sectionName = button.getAttribute("data-section");
          if (!sectionName) throw new Error("Missing section name");
          await editCardSection(card, sectionName, card.sections?.[sectionName] ?? "");
        } else if (action === "workspace-tab") {
          const nextTab = button.getAttribute("data-tab");
          if (!nextTab) throw new Error("Missing workspace tab");
          state.workspaceTab = nextTab;
          renderDetail();
          return;
        } else if (action === "complete-pr") {
          await fetchJson(`/api/cards/${encodeURIComponent(id)}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ withPr: true }),
          });
        } else if (action === "review-start") {
          await fetchJson(`/api/cards/${encodeURIComponent(id)}/review/start`, { method: "POST" });
        } else if (action === "review-approve") {
          await fetchJson(`/api/cards/${encodeURIComponent(id)}/review/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
          });
        } else if (action === "review-request-changes") {
          await fetchJson(`/api/cards/${encodeURIComponent(id)}/review/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "request-changes" }),
          });
        } else {
          await fetchJson(`/api/cards/${encodeURIComponent(id)}/${action}`, { method: "POST" });
        }
        await loadBoard();
        await selectCard(id);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function loadBoard() {
  state.board = await fetchJson("/api/board");
  renderBoard();
}

async function selectCard(id) {
  state.selectedId = id;
  renderBoard();
  if (!id) {
    state.selectedCard = null;
    state.selectedWorkspaceView = null;
    renderDetail();
    return;
  }
  state.selectedCard = await fetchJson(`/api/cards/${encodeURIComponent(id)}`);
  state.workspaceTab = "diff";
  state.selectedWorkspaceView = state.selectedCard.workspace?.path
    ? await fetchJson(`/api/cards/${encodeURIComponent(id)}/workspace-view`)
    : null;
  renderDetail();
}

document.querySelector("#refresh-button").addEventListener("click", async () => {
  await loadBoard();
  if (state.selectedId) await selectCard(state.selectedId);
});

document.querySelector("#create-button").addEventListener("click", async () => {
  const title = window.prompt("Card title");
  if (!title) return;
  try {
    const card = await fetchJson("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, template: "agent-task" }),
    });
    await loadBoard();
    await selectCard(card.id);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  }
});

await loadBoard();
const firstCard = state.board.columns.flatMap((column) => column.cards)[0];
if (firstCard) {
  await selectCard(firstCard.id);
}

const events = new EventSource("/api/events");
events.addEventListener("board-invalidated", async () => {
  await loadBoard();
  if (state.selectedId) {
    try {
      await selectCard(state.selectedId);
    } catch {
      state.selectedId = null;
      state.selectedCard = null;
      state.selectedWorkspaceView = null;
      renderDetail();
    }
  }
});
