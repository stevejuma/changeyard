---
change: CY-0018
review: 2
reviewer: stevejuma
status: changes_requested
createdAt: 2026-06-17T11:34:13.042Z
commitBased: false
completedAt: 2026-06-17T11:34:30.653Z
---

# Summary

Requesting changes to add merge editor option controls and persisted settings.

# Required Changes

- [x] Add a merge editor header menu for supported diff/display options and reset-to-original.
- [x] Add a Merge Editor settings category using the same persisted global preference state.
- [x] Ensure changing options in the merge editor menu updates global state and future editor instances.

# Resolution

- Added a Radix DropdownMenu to the merge React wrapper for editor options.
- Wired the options to persisted VCS merge editor preferences and exposed them in Settings > Merge Editor.
- Verified in browser that the popup renders above the full-screen merge editor and that defaults/preferences are reflected in Settings.

# Inline Comments

None.

# Planning Context

- Model: openspec-lite
- Strictness: normal
- Phase: draft
- Canonical local file: `.changeyard/changes/CY-0018-open-conflicts-in-full-screen-merge-editor.md`
- Next action: Complete pending planning gate: proposal
