import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPlanningMetadata, isPlanningEnabled, readPlanningMetadata } from "../src/planning/model.js";
import { buildPlanningPrompt } from "../src/planning/prompts.js";
import { hasMarkedSection, parseMarkedSections, replaceMarkedSection } from "../src/planning/sections.js";
import { summarizePlanningSections } from "../src/planning/status.js";
import { validatePlanningMarkers } from "../src/planning/validation.js";

function sampleMarkdown(): string {
  return [
    "# Summary",
    "",
    "Summary text.",
    "",
    "<!-- cy:proposal:start -->",
    "# Proposal",
    "",
    "## Intent",
    "",
    "Ship the first planning slice.",
    "<!-- cy:proposal:end -->",
    "",
    "<!-- cy:design:start -->",
    "# Design",
    "",
    "## Technical Approach",
    "",
    "Keep the markdown canonical.",
    "<!-- cy:design:end -->",
    "",
    "<!-- cy:tasks:start -->",
    "# Tasks",
    "",
    "- [ ] Add parser",
    "<!-- cy:tasks:end -->",
  ].join("\n");
}

test("parseMarkedSections reads supported marked planning sections", () => {
  const sections = parseMarkedSections(sampleMarkdown());
  assert.equal(sections.get("proposal"), "# Proposal\n\n## Intent\n\nShip the first planning slice.");
  assert.equal(sections.get("design"), "# Design\n\n## Technical Approach\n\nKeep the markdown canonical.");
  assert.equal(sections.get("tasks"), "# Tasks\n\n- [ ] Add parser");
  assert.equal(hasMarkedSection(sampleMarkdown(), "proposal"), true);
});

test("parseMarkedSections preserves nested headings inside markers", () => {
  const markdown = [
    "<!-- cy:verification:start -->",
    "# Verification",
    "",
    "## Manual Scenarios",
    "",
    "### Scenario: start gate",
    "",
    "- GIVEN a planned change",
    "- WHEN the proposal is empty",
    "- THEN start is blocked",
    "<!-- cy:verification:end -->",
  ].join("\n");

  const sections = parseMarkedSections(markdown);
  assert.equal(
    sections.get("verification"),
    "# Verification\n\n## Manual Scenarios\n\n### Scenario: start gate\n\n- GIVEN a planned change\n- WHEN the proposal is empty\n- THEN start is blocked",
  );
});

test("replaceMarkedSection updates only the target marker content", () => {
  const markdown = sampleMarkdown();
  const updated = replaceMarkedSection(markdown, "design", [
    "# Design",
    "",
    "## Technical Approach",
    "",
    "Use stable marker ranges for updates.",
  ].join("\n"));

  assert.match(updated, /Use stable marker ranges for updates\./);
  assert.match(updated, /Ship the first planning slice\./);
  assert.match(updated, /- \[ \] Add parser/);
  assert.equal(updated.includes("# Summary\n\nSummary text."), true);
});

test("parseMarkedSections reports missing end markers", () => {
  const result = validatePlanningMarkers("<!-- cy:proposal:start -->\n# Proposal\n");
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["Missing end marker for planning section: proposal"]);
});

test("parseMarkedSections reports duplicate markers", () => {
  const result = validatePlanningMarkers([
    "<!-- cy:proposal:start -->",
    "One",
    "<!-- cy:proposal:start -->",
    "Two",
    "<!-- cy:proposal:end -->",
  ].join("\n"));
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["Duplicate start marker for planning section: proposal"]);
});

test("parseMarkedSections reports wrong marker order", () => {
  const result = validatePlanningMarkers([
    "<!-- cy:design:end -->",
    "Broken",
    "<!-- cy:design:start -->",
  ].join("\n"));
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["End marker appears before start marker for planning section: design"]);
});

test("planning metadata and status helpers normalize inline planning state", () => {
  const frontmatter = {
    planning: {
      model: "openspec-lite",
      storage: "inline",
      schema: "changeyard-openspec-lite@1",
      strictness: "strict",
      phase: "draft",
      gates: {
        proposal: "pending",
      },
    },
  };

  const metadata = readPlanningMetadata(frontmatter);
  assert.equal(metadata?.model, "openspec-lite");
  assert.equal(metadata?.strictness, "strict");
  assert.equal(isPlanningEnabled(frontmatter), true);

  const summary = summarizePlanningSections(frontmatter, sampleMarkdown());
  assert.equal(summary.enabled, true);
  assert.deepEqual(summary.presentSections, ["proposal", "design", "tasks"]);
  assert.deepEqual(summary.missingSections, ["spec-deltas", "verification", "clarifications", "requirements-checklist", "analysis"]);
});

test("buildPlanningPrompt targets the canonical section and forbids default external folders", () => {
  const prompt = buildPlanningPrompt({
    changeId: "CY-0007",
    title: "Add plugin permissions UI",
    canonicalPath: ".changeyard/changes/CY-0007-add-plugin-permissions-ui.md",
    section: "design",
    currentContent: "# Design\n\nPending.",
    targetStartMarker: "<!-- cy:design:start -->",
    targetEndMarker: "<!-- cy:design:end -->",
  });

  assert.match(prompt, /Canonical file: \.changeyard\/changes\/CY-0007-add-plugin-permissions-ui\.md/);
  assert.match(prompt, /Target section: design/);
  assert.match(prompt, /Target markers: <!-- cy:design:start --> \.\.\. <!-- cy:design:end -->/);
  assert.match(prompt, /Do not create openspec\/, specs\/, checklists\/, or other external planning folders/);
});

test("createDefaultPlanningMetadata creates the expected inline default shape", () => {
  const metadata = createDefaultPlanningMetadata();
  assert.deepEqual(metadata, {
    model: "openspec-lite",
    storage: "inline",
    schema: "changeyard-openspec-lite@1",
    strictness: "normal",
    phase: "draft",
    gates: {},
  });
});
