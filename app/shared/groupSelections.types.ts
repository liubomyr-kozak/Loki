export interface GroupAppIntent {
  branch?: string;
  environment?: string;
}

export type GroupSelections = Record<string /* groupTag */, Record<string /* appName */, GroupAppIntent>>;

