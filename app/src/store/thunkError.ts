import type { SerializedError } from '@reduxjs/toolkit'

export function rejectionMessage(
  action: { error: SerializedError },
  fallback: string
): string {
  return action.error.message || fallback
}
