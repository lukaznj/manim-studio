/** Sign-in diagnostics must never persist browser codes, credentials, or OAuth URL parameters. */
export function redactLoginLog(value: string): string {
  return value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/https?:\/\/[^\s\x1b\x07]+/gi, '[URL omitted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email omitted]')
    .replace(/\b(Bearer\s+)\S+/gi, '$1[redacted]')
    .replace(/(["']?(?:authorization(?:[_ -]?code)?|access[_ -]?token|refresh[_ -]?token|id[_ -]?token|api[_ -]?key|password|secret)["']?\s*[=:]\s*["']?)[^\s,;"'}]+/gi, '$1[redacted]')
    .replace(/\b(?:ya29\.[\w.-]+|AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|4\/[\w/-]+)/g, '[credential omitted]')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .slice(-12000)
}

export function loginFailureDetails(error: unknown, log = ''): string {
  const message = error instanceof Error ? error.message : String(error)
  return redactLoginLog([message, log].filter(Boolean).join('\n'))
}
