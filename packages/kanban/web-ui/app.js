const state = {
  board: null,
  selectedId: null,
  selectedCard: null,
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
  const buttons = [];
  if (card.status === "ready") {
    buttons.push(`<button class="action-button" data-action="sync" data-id="${card.id}" type="button">Sync</button>`);
  }
  if (["ready", "synced", "changes_requested"].includes(card.status)) {
    buttons.push(`<button class="action-button" data-action="start" data-id="${card.id}" type="button">Start workspace</button>`);
  }
  return buttons.join("");
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
          <h4>${name}</h4>
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
        await fetchJson(`/api/cards/${encodeURIComponent(id)}/${action}`, { method: "POST" });
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
    renderDetail();
    return;
  }
  state.selectedCard = await fetchJson(`/api/cards/${encodeURIComponent(id)}`);
  renderDetail();
}

document.querySelector("#refresh-button").addEventListener("click", async () => {
  await loadBoard();
  if (state.selectedId) await selectCard(state.selectedId);
});

await loadBoard();
const firstCard = state.board.columns.flatMap((column) => column.cards)[0];
if (firstCard) {
  await selectCard(firstCard.id);
}
