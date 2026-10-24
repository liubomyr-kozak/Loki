export interface InstanceRecord {
  id: string;
  appName: string;
  label?: string;
  order?: number;
  createdAt: string;
  // Optional per-instance environment override (ADR phase 2): when set and it
  // resolves to something other than the app's own default selection, this
  // instance is "detached" and gets its own process (see
  // backend/process/linkage.ts). Absent on every instance created before
  // this field existed — coerce() below passes records through as-is, so a
  // pre-existing sidecar with no `envOverride` on its records still loads
  // cleanly and those instances simply stay linked.
  envOverride?: string;
}

export type Instances = Record<string /* instanceId */, InstanceRecord>;

