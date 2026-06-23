<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# gstack

gstack is installed at `~/.claude/skills/gstack`. Use the `/browse` skill from gstack for all web browsing — never use `mcp__claude-in-chrome__*` tools directly.

## Available gstack skills

| Skill | Purpose |
|---|---|
| `/office-hours` | Describe what you're building — get product/strategy feedback |
| `/plan-ceo-review` | CEO-level review of a feature idea before building |
| `/plan-eng-review` | Engineering architecture review |
| `/plan-design-review` | Design review of a plan |
| `/plan-devex-review` | Developer experience review |
| `/design-consultation` | Design consultation on UI/UX |
| `/design-shotgun` | Generate multiple design directions fast |
| `/design-html` | Build/iterate HTML/CSS designs |
| `/design-review` | Review existing design for slop and issues |
| `/review` | Full code review of current branch changes |
| `/ship` | Create PR, run checks, prepare to ship |
| `/land-and-deploy` | Merge PR and deploy |
| `/canary` | Canary deploy with monitoring |
| `/qa` | Open a real browser and QA a URL end-to-end |
| `/qa-only` | QA without code review |
| `/cso` | Security officer — OWASP + STRIDE audit |
| `/autoplan` | Auto-generate an implementation plan |
| `/investigate` | Deep investigation of a bug or issue |
| `/retro` | Run a retrospective on recent work |
| `/learn` | Learn from the codebase or a topic |
| `/document-release` | Generate release notes |
| `/document-generate` | Generate documentation |
| `/codex` | Run a Codex task |
| `/benchmark` | Benchmark models or code |
| `/browse` | Browse the web (use this instead of chrome MCP tools) |
| `/connect-chrome` | Connect to Chrome for browser automation |
| `/setup-browser-cookies` | Set up browser cookies for auth |
| `/setup-deploy` | Set up deployment pipeline |
| `/setup-gbrain` | Set up gstack brain (memory/context) |
| `/careful` | Extra-careful mode for risky changes |
| `/freeze` | Freeze a dependency or config |
| `/guard` | Add guards/validation to code |
| `/unfreeze` | Unfreeze a frozen dependency |
| `/gstack-upgrade` | Upgrade gstack to latest version |
