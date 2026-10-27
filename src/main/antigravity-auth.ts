/** The managed CLI uses go-keyring's service/user pair, not the label shown in its prompt. */
export const AGY_KEYRING_SERVICE = 'gemini'
export const AGY_KEYRING_ACCOUNT = 'antigravity'

export function macGoogleCredentialArgs(action: 'find' | 'delete'): string[] {
  // No -w or -g: lookup checks existence/attributes and never requests the stored secret.
  return [`${action}-generic-password`, '-s', AGY_KEYRING_SERVICE, '-a', AGY_KEYRING_ACCOUNT]
}

/** An already saved account and a save just before the helper exits both count as success. */
export async function googleSignInSaved(check: () => Promise<{ loggedIn: boolean }>): Promise<boolean> {
  try { return (await check()).loggedIn } catch { return false }
}
