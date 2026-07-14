---
name: Quick Change
type: quick
requiredFrontmatter:
  - title
  - type
  - priority
  - labels
requiredSections:
  - Summary
  - Scope
  - Acceptance Criteria
  - Completion Notes
  - Change Slices
validation:
  requireUncheckedAcceptanceCriteria: true
  requireNonEmptySections: true
---

# Summary

Describe the small change.

# Scope

- [ ] Small, low-risk change
- [ ] No behavior change
- [ ] No public API change
- [ ] No storage/schema change
- [ ] No provider/workspace lifecycle change
- [ ] No UI workflow change
- [ ] No security-sensitive change

# Acceptance Criteria

- [ ] Replace this item with measurable completion criteria

# Completion Notes

Summarize changed areas, checks, and remaining risks or follow-ups. Use evidence such as `Checks run: pnpm test.`, `Tests passed: focused CLI suite.`, or `No checks were run because this was documentation-only.`

# Change Slices

No slices committed yet.
