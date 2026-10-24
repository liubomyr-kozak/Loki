/** Best-effort human-readable message from an unknown thrown value.
 *  Mirrors the legacy `(err as any).message ?? err` fallback exactly. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && typeof (err as any).message === 'string') {
    return (err as any).message;
  }
  return String(err);
}
