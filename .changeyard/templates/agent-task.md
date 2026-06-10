---
name: Agent Task
type: agent-task
requiredFrontmatter:
  - title
  - type
  - priority
  - labels
requiredSections:
  - Summary
  - Motivation
  - Plan
  - Acceptance Criteria
  - Scope Boundaries
  - Agent Plan
  - Completion Notes
validation:
  requireUncheckedAcceptanceCriteria: true
  requireNonEmptySections: true
---

# Summary

Describe the change to make.

# Motivation

Explain why this work matters.

# Plan

- [ ] Replace this item with the implementation plan

# Acceptance Criteria

- [ ] Replace this item with measurable completion criteria

# Scope Boundaries

## In scope

- List the paths, modules, commands, or behaviors this task is allowed to change.

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

Write the agent's implementation plan here before starting work.

# Completion Notes

Summarize what changed, what checks ran, and what risks remain.
