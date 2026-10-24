# Contributing to Loki

Thanks for helping. This page covers how to propose a change. How to set up
the code is in [Development](wiki/guides/development.md).

## Reporting a problem

Open an [issue](https://github.com/liubomyr-kozak/Loki/issues) with:

- your OS and Loki version (shown on the
  [release](https://github.com/liubomyr-kozak/Loki/releases) you installed,
  or `version` in `package.json` for a source checkout);
- what you did, what you expected and what happened;
- errors from the backend log (see
  [Troubleshooting](wiki/guides/troubleshooting.md#port-9999-or-1421-is-already-in-use)
  for where it is).

Check [Troubleshooting](wiki/guides/troubleshooting.md) first; many install and
launch problems are covered there.

## Making a change

1. Create a branch from `main`, named `feature/<short-name>` for new
   behaviour or `fix/<short-name>` for a bug fix.
2. Make the change, with tests where the behaviour can be tested (see
   [Checks](#checks)).
3. Update the documentation that describes the behaviour you changed, in the
   same branch: `README.md`, the guide under `wiki/guides/`, and the wiki
   design note if it describes the module. Add a line for the change to
   `wiki/log.md`.
4. Open a pull request against `main`. Describe what was wrong or missing
   before, what is different after, and how you checked it.

A pull request ends up as **one commit** on `main`: squash your work before
merging, or merge with *Squash and merge*.

## Versions

A Git pre-commit hook (installed by `yarn install` through Husky) raises the
minor version in `package.json`, `app/src-tauri/tauri.conf.json` and
`app/src-tauri/Cargo.toml` on every local commit. Commits made on GitHub do
not run it. The full rules, including `Cargo.lock`, are in
[Releasing](wiki/guides/releasing.md#1-raise-the-version).

## Checks

Run these from the repository root before opening a pull request. CI runs
the first four on macOS, Linux and Windows, and also builds the desktop app
on each.

```sh
yarn server:build                # backend compiles
yarn ui:build                    # UI type-checks and builds
yarn test                        # unit tests (Vitest)
node scripts/smoke-test.js       # backend starts from source, compiled and packaged
```

For changes to the UI or to process, Git or plugin behaviour, also run the
end-to-end tests (see
[Development → Tests](wiki/guides/development.md#tests)).

## Code style

- Match the code around your change: naming, comment density, file layout.
- `app/shared/` stays free of Node.js and backend imports; the UI imports it.
- The UI talks to the backend only through `app/src/api.ts`.
- Plugins are reached only through the plugin host in `app/backend/plugins/`.

## Writing documentation

All documentation is in [`wiki/`](wiki/index.md); there is no separate
`docs/` folder. Guides for people using or building Loki are in
`wiki/guides/`, design notes in the other folders. Each page starts with
front matter (`type`, `title`, `timestamp`), and each folder's `index.md`
lists its pages.

- Write for the reader of that page: user pages name what is on screen,
  developer pages name files and commands.
- Check every statement against the code or by running it. If something is
  stored but not used yet, say so.
- English, short sentences, one topic per section, links instead of
  repetition.

## License

By contributing you agree that your contribution is released under the
[MIT License](LICENSE).
