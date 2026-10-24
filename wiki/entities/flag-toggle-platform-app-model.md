---
type: concept
title: Flag-toggle platform/app model
timestamp: "2026-07-24T08:16:30Z"
---

# Flag-toggle platform/app model

# Flag-toggle platform/app model

## The model

The flag-toggle plugin's per-app config splits apps into exactly two roles:

- **Platform app** — holds the *real* flag-toggle file path and strategy.
  There is exactly one platform app per flag-toggle deployment; it owns the
  actual on-disk flag file and the strategy used to write it.
- **Every other (non-platform) app** — carries only a *lookup key* into the
  platform app's file. It has no file of its own; toggling it resolves
  through the platform's real file using that key.

This is implemented in `app/src/components/Dashboard/FlagToggleSettings.tsx`:

```ts
// Platform apps hold the real flag-toggle file + strategy; every other app just
// carries a lookup key into the platform's file. Distinguished by whether a
// `file` value is already set, or the app name is tagged "-platform-".
function isFlagTogglePlatform(cfg: AppConfig, name: string): boolean {
  return typeof cfg.plugins?.['flag-toggle']?.file === 'string' || name.includes('-platform-')
}
```

## Why the distinction is structural, not decorative

The role is **not** a separate boolean/enum flag stored in config — it is
derived at render time from two independent signals, either of which is
sufficient:

1. `cfg.plugins?.['flag-toggle']?.file` is already a non-empty string (the
   app has a real file configured), or
2. the app's name contains the literal substring `-platform-`.

Either signal alone marks the app as platform. This dual check exists
because a freshly-configured platform app may not yet have `file` set (so
the name convention catches it), while an app that *does* have `file` set
should be treated as platform even if it doesn't happen to carry the
`-platform-` naming convention.

## UI consequence

`FlagToggleSettings` renders two entirely different field sets depending on
`isFlagTogglePlatform`:

- **Non-platform app**: a single "Flag-toggle key" row (`flagToggle?.key`) —
  editable via `InlineEdit`, patched through `patchFlagToggle({ key: v })`.
- **Platform app**: two rows, "Flag-toggle file" (`flagToggle?.file`) and
  "Flag-toggle strategy" (`flagToggle?.strategy`) — each independently
  editable and patched the same way.

A platform app never shows a "key" field (it doesn't need to look itself up
in another app's file), and a non-platform app never shows "file"/"strategy"
fields (it has neither — those live only on the platform app's config).

## Relationship to the toggle-visibility contract (see also flag-toggle-platform-app-model in memory)

This page documents the same platform/app split previously tracked only in
an agent memory note (`flag-toggle-platform-app-model.md`). The broader
plugin-agnostic contract — which apps show a toggle control at all
(`visible = has-key && not-platform`), and where the checked/unchecked state
is actually read from (the platform's real file via the backend, not a
decorative per-app config key) — belongs to the plugin's backend/runtime
layer rather than this frontend settings component; this page covers only
the frontend field-editing surface (`FlagToggleSettings.tsx`) described
above. Consult `plugin-agnostic-architecture` for how the plugin as a whole
attaches to apps and surfaces its controls.

