# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# workflow
- When asked to critique/review an existing plan of record, produce the critique and append it as an additional perspective without writing it as prescriptive implementation directives — do not conflate "planning/critiquing" with "implementing." Confidence: 0.60
- Don't commit IMPLEMENTATION_PLAN.md (gitignored, local only). Confidence: 0.85
- Don't commit without being asked. Confidence: 0.85
- Run npm run build + tsc --noEmit clean before declaring a stage done. Confidence: 0.80

# code-style
- Use toast notifications, not alert() dialogs. Confidence: 0.85
- Follow existing code patterns in the repo. Confidence: 0.75

# architecture
- Use server actions over client-side DB access. Confidence: 0.85
- Never trust client prices or discounts — recompute server-side. Confidence: 0.85
- Never substitute mock/placeholder data for real data — show honest empty states instead of silently covering up failures (dead DB looks broken, not healthy). Confidence: 0.70
