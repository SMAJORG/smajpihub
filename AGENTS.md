# Theme requirements for frontend changes

- Every new or updated interface must support both light and dark themes.
- Use existing semantic variables for surfaces, text, borders, and interaction states:
  `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--soft-bg`,
  `--primary`, `--primary-soft`, `--accent`, and `--shadow-soft`.
  Existing `--smaj-*` semantic aliases are also supported.
- Do not hardcode white/dark panel backgrounds, text, borders, or control colors,
  including in React inline styles. Keep semantic token definitions in the shared
  theme files and define new tokens for both themes when needed.
- Brand marks, artwork, charts, status indicators, and deliberately fixed contrast
  pairs may use literal colors when justified. On the same line, add a comment
  such as `/* theme-color-exception: white text on the fixed brand button */`.
  Do not use exceptions merely to silence the check.
- Avoid broad global control overrides and new `!important` declarations. Inspect
  computed styles with the full application CSS loaded to catch cascade conflicts.
- Before finishing UI changes, check both themes, including open menus, dialogs,
  selected/hover/focus/disabled states, and readable text contrast. Preserve the
  user's selected theme. Theme colors must not depend on a page-specific toggle.
- Run `npm.cmd run check:theme -- --base <base-commit>` from `frontend` (use `npm`
  outside Windows). Without `--base`, it checks uncommitted changes against HEAD.
  Stage new files first so Git includes them in the local diff check.
  Run `npm.cmd run test:theme-check` when changing the checker. For desktop header
  changes, also run `npm.cmd run test:header:browser -- --grep "desktop panels follow"`.

The theme check scans added lines, not all existing styles. It is a guard against
common CSS and inline-style literal colors, not a substitute for browser review;
it cannot prove contrast or recognize every CSS-in-JS or utility-class pattern.
