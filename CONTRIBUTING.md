# Contributing

1. Open an issue describing the change before large work.
2. Fork, branch from `main` (`feat/…`, `fix/…`), keep diffs small and scoped.
3. Keep it dependency-free and Desktop+Web compatible (`vscode` API, fetch,
   timers only — no node builtins). Validate with esbuild before pushing.
4. Test on VS Code Desktop and web, note results in the PR.
5. One concern per PR.
