# Claude Optimizer — Session Guidance

Based on analysis of 838 sessions across 28 projects.
Last updated: 2026-04-15T00:44:09.946Z

## Known Issues

- Add file structure conventions to AGENTS.md — 21 sessions had heavy edit thrashing. The agent rewrites files repeatedly instead of converging. Consider adding patterns like "read the full file before editing" or "plan edits before writing".
- Investigate session restart patterns — 77 restart clusters detected. Users are repeatedly starting new sessions, suggesting the agent fails to recover from errors. Consider adding "when stuck, summarize what you've tried and ask the user for guidance".
- Add error recovery guidelines to AGENTS.md — 112 error loops detected. The agent retries failing tools without changing approach. Add a rule like "after 2 consecutive tool failures, stop and reassess the approach".
- Critical: 33 session(s) had extreme user frustration. Review these sessions to identify specific failure patterns and add targeted rules to AGENTS.md.
- Review task understanding patterns — 49 sessions had negative user sentiment. The agent may be misunderstanding instructions. Consider adding clearer domain-specific terminology to AGENTS.md.
- Address session quality degradation — 19 sessions showed worsening user interactions over time. The agent loses context or accumulates errors. Consider adding "periodically re-check original requirements" to AGENTS.md.
- High session abandonment detected in 15 project(s). Many sessions end with fewer than 3 messages. The agent may be failing on initial setup or misunderstanding the first prompt.
- Add codebase navigation hints to AGENTS.md — 7 sessions had excessive read-to-edit ratios. The agent spent too long exploring before acting. Add key file paths, architecture overview, or "start here" pointers.
- Improve first-attempt accuracy — 4 sessions had users correcting within seconds of agent output. The agent produces obviously wrong results. Review common failure patterns and add guardrails to AGENTS.md.
- Improve instruction adherence — 5 sessions had the user repeating the same instruction. The agent isn't following through. Consider adding "re-read the user's last message before responding" or more explicit domain rules.
- 8 sessions had many reads but zero edits — the agent may be stuck or confused about what action to take. Consider adding explicit task patterns to AGENTS.md.

## Rules for This Session

If you notice yourself exhibiting any of these patterns, STOP and course-correct:

- **STOP re-editing the same file repeatedly.** Read the full file, plan your changes, then make ONE complete edit. If you've edited a file 3+ times, pause and re-read the user's requirements.
- **Double-check your output before presenting it.** Users have been correcting within seconds — your first attempts are often obviously wrong. Verify before responding.
