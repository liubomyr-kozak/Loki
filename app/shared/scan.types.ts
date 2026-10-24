export interface ScannedScript {
  name: string;
  raw: string;
  startCommand: string;
  isRunLike: boolean;
}

export interface ScanResult {
  name: string;
  dirPath: string;
  packageManager: string;
  hasPackageJson: boolean;
  scripts: ScannedScript[];
}

export interface ComponentCandidate {
  path: string;
  version?: string;
  source: 'detected' | 'custom';
}

export type DetectedComponentId = 'tmux' | 'node' | 'shell';

export interface DetectedComponent {
  id: DetectedComponentId;
  label: string;
  found: boolean;
  candidates: ComponentCandidate[];
}

export interface RuntimePaths {
  stateDir: string;
  sessionsDir: string;
  /** Your plugin folders, first one receives installs (GlobalConfig.pluginFolders). */
  pluginFolders: string[];
}

export interface DetectedRuntime extends RuntimePaths {
  components: DetectedComponent[];
}

