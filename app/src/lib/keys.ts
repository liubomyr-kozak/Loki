export function sanitizeKey(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '')
  return /^[a-z0-9]/.test(cleaned) ? cleaned : `env-${cleaned}`
}
