# Workspace Skills and Instructions

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Available skills
- `playwright`: Use when the task requires automating a real browser from the terminal (navigation, form filling, snapshots, screenshots, data extraction, UI-flow debugging) via `playwright-cli` or the bundled wrapper script. (file: `/Users/cdevroe/.codex/skills/playwright/SKILL.md`)
- `screenshot`: Use when the user explicitly asks for a desktop or system screenshot (full screen, specific app or window, or a pixel region), or when tool-specific capture capabilities are unavailable and an OS-level capture is needed. (file: `/Users/cdevroe/.codex/skills/screenshot/SKILL.md`)
- `spreadsheet`: Use when tasks involve creating, editing, analyzing, or formatting spreadsheets (`.xlsx`, `.csv`, `.tsv`) with formula-aware workflows, cached recalculation, and visual review. (file: `/Users/cdevroe/.codex/skills/spreadsheet/SKILL.md`)
- `skill-creator`: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: `/Users/cdevroe/.codex/skills/.system/skill-creator/SKILL.md`)
- `skill-installer`: Install Codex skills into `$CODEX_HOME/skills` from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: `/Users/cdevroe/.codex/skills/.system/skill-installer/SKILL.md`)
- `signboard-mcp`: Use when working with Signboard boards through a local Signboard MCP server on this Mac, including listing views, lists, and cards and safely creating, updating, moving, archiving, or configuring board data. (file: `/Users/cdevroe/.codex/skills/signboard-mcp/SKILL.md`)
- `signboard-cli`: Use when working with Signboard through the terminal CLI on this Mac, especially for direct shell-based board management such as selecting a board, listing lists or cards, and creating or editing cards without MCP. (file: `/Users/cdevroe/.codex/skills/signboard-cli/SKILL.md`)

### Signboard skill boundaries
- Prefer `signboard-mcp` when the user explicitly asks for MCP, when MCP tools are available, or when the task maps cleanly to structured Signboard MCP operations.
- Prefer `signboard-cli` when the user explicitly asks for CLI usage, when MCP is unavailable, or when the task is naturally terminal-first.
- Do not silently swap between `signboard-mcp` and `signboard-cli` if the user explicitly chose one; if the requested path is blocked, say so and then use the other only with clear explanation or user approval.
- If both could work and the user did not specify, choose the narrower tool for the job: MCP for structured board operations, CLI for shell workflows and command-driven inspection.

### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1. After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2. When `SKILL.md` references relative paths (for example `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3. If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4. If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5. If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
