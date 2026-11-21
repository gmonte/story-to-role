# Visual theme “Paper and ink”: tokens only, the sheet stays paper, ink is the primary action

The app's look is defined only by CSS tokens: oklch variables in `:root` and `.dark` in `packages/web/src/styles/globals.css`, mapped in `@theme inline`. Components stay shadcn/ui as they are, with no hand-written CSS and no literal colors; a Tailwind palette color (`emerald-500`, `amber-600`…) in a component is a review finding. Every semantic color is a token: the fit bands (`fit-*`), requirement verdicts (`req-*`), the resume score (`score-*`), application statuses (`status-*`), the document's origin marks (`origin-*`), warnings (`warning-*`) and `success`. Application statuses map onto the status tokens: in preparation `status-preparing`, applied `status-sent`, in process `status-interview`, offer and hired `success`, rejected `destructive`, withdrawn and no response `status-analyzed`.

- **The document sheet is paper in both themes.** The resume and cover letter sheet is the PDF the user downloads, so its `doc-*` and `origin-*` tokens keep their light values in dark mode, and everything drawn on it (suggestion cards, highlights, hints) takes the light palette through the `doc-sheet` class, which re-declares the `:root` tokens. Its accent (`doc-accent`) is a sober ink blue, never the app's orange. In dark mode the sheet is a bright surface on a dark desk, on purpose.
- **The primary action is ink** (paper in dark), not orange. The orange accent is kept for the logo, the active item, credits, keyboard focus and the recommended plan.
- **Light and dark are designed separately.** In light, the side columns are a tinted tray (`muted`) a step darker than the main panel; in dark, columns sink below the panel and cards rise above it. Each level reads apart from the one it sits on: cards use `bg-card`, boxes inside a card `bg-muted`. Only what floats gets a shadow: the panel (`shadow-panel`), the sheet (`shadow-sheet`) and menus (`shadow-pop`).
- **Badges have two shapes.** Fit, verdicts and the score are soft fills; an application's status is an outline with a dot, so they never compete side by side.
- **Type:** Space Grotesk 600 for headings, IBM Plex Sans for the interface and the documents, IBM Plex Mono for the profile's marks (`[medido]`, `[estimado]`, `[sem número]`) and credit figures.
- **Every text pair passes WCAG AA in both themes** (4.5:1 for text, 3:1 for field outlines, focus rings and origin rules), which is why field outlines (`input`) are darker than shadcn's default.

The theme was proposed in a Claude Design canvas, “StoryToRole · tema Papel e tinta”, which holds the visual reference for each screen and the contrast table.

## Considered Options

- **shadcn's defaults with a brand accent:** what the app had. Almost all white and grey, surfaces hard to tell apart, no identity; semantic colors came straight from the Tailwind palette inside components, so changing one meant editing many files.
- **Orange as the primary color:** the brand's accent on every main button would fight the fit bands, warnings and errors for attention, and lose its meaning as the marker of what is the user's (credits, focus, the active item).
- **A dark document sheet in dark mode:** the sheet would no longer look like the PDF the user sends, and every origin mark and document color would need a second, untested set of values.
