<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep shared browser-safe auth destination sanitization in a dedicated utility so password and OAuth flows apply the same same-origin rule.
- Use compensating storage cleanup when lift creation fails after video upload so abandoned evidence does not accumulate.

## Global product and UI quality standards

- UI must look deliberately designed by a high-quality product team, not generic AI output. Avoid generic purple/blue gradients, emoji icons, nested rounded-card clutter, dense small-gray text, and low-attention default styling.
- Use a consistent icon system (Lucide React already installed; no emoji as icons), a readable and distinctive font hierarchy, deliberate spacing, and polished visual details.
- Keep copy minimal. Prefer short labels (1–3 words), clear visual cues, and strong typography. Remove redundant helper copy; simplify layouts instead of explaining them with paragraphs.
- Make interaction affordances unambiguous. Every visible interactive element must work and lead somewhere meaningful; no dead buttons, links, avatar rows, crew rows, or rank rows.
- Use fast, tasteful motion for navigation, press feedback, list entry, number changes, progress, and success states. Respect `prefers-reduced-motion`; avoid expensive effects and preserve smooth performance on mid-range Android devices.
- Every screen must account for loading (skeleton), empty (one clear next action), and error (friendly message plus Retry where retry is meaningful) states. Never expose raw error messages to users.
- Preserve REPUNIT's black/red identity and use a small, disciplined palette. Warm gold is the secondary accent for ranks, trophies, wins, and premium highlights; cool cyan is reserved for informational states and links. Avoid rainbow palettes.
- Design mobile-first and verify layouts at 390px width.
- Keep existing functionality unless the user explicitly requests removal. Do not make unrelated redesigns during focused changes.
- Before considering a phase complete, run and report the actual outputs of `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Fix errors first; never fabricate test results.
