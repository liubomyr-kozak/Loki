# Concepts

* [Backend module boundary contracts](backend-module-boundary-contracts.md)
* [Backend Route/API reference](backend-route-api-reference.md)
* [Branch signal & refresh scope](branch-signal-and-refresh-scope.md) - Which Redux state is the live git-branch signal (apps.apps[].branch, poll-backed) vs the picker-only branchesByApp; what refreshAll refreshes; where env scan candidates live.
* [Config read/write contract](config-read-write-contract.md)
* [Flag-toggle platform/app model](flag-toggle-platform-app-model.md)
* [Frontend component contracts](frontend-component-contracts.md)
* [Frontend picker/selector contracts](frontend-picker-selector-contracts.md)
* [Git stash flow contract](git-stash-flow-contract.md)
* [Per-(group, app) branch & environment intent](group-app-intent-contract.md) - The groupSelections.json sidecar keyed by (group tag, app name), its opaque-tag backend contract, the two-store resolution order, and why a group entry is intent rather than isolation.
* [Plugin-agnostic architecture](plugin-agnostic-architecture.md)
* [Provider session lifecycle](provider-session-lifecycle.md)
* [Session providers & effective config](session-providers-effective-config.md)
