export const DROP_STASH_ITEM = 'Drop stash…'

export const SEARCH_THRESHOLD = 9

export const ROW_HEIGHT = 30
export const MAX_VISIBLE_ROWS = 8
export const MENU_MIN_WIDTH = 180
export const MENU_MAX_WIDTH = 300

export const VIEWPORT_MARGIN = 8

// The menu is portaled to `document.body`, so it needs the repo's established
// body-level portal layer (matches `popoverStyle.zIndex` in Popover.tsx) rather
// than a stacking context scoped to `.pickerMenu`'s old in-flow parent.
export const PICKER_MENU_Z_INDEX = 9999
