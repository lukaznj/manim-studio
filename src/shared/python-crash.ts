/**
 * What a Python step that died without reporting an error event says, for people: the last line
 * of its traceback ("AttributeError: …") rather than just an exit code.
 */
export function pythonCrashMessage(log: string[], code: number | null): string {
  const last = [...log].reverse().map((line) => line.trim()).find((line) => /^[A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt)(?::\s.*)?$/.test(line))
  return last ? `Python stopped: ${last.slice(0, 300)}` : `Python exited with code ${code}`
}
