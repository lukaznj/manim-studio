/** Capacity failures are distinct from account limits, authentication and tool failures. */
export function isModelCapacityError(message = ''): boolean {
  if (/quota|usage.limit|rate.limit|unauthoriz|authentication|not.supported|not.found|does.not.exist|permission/i.test(message)) return false
  return /server[_ ](?:is[_ ])?overloaded|model[_ ]capacity|(?:model|service).{0,80}(?:overloaded|at capacity|high demand|temporarily unavailable)|at capacity.{0,80}model|high demand|too many (?:people|users)|no available capacity/i.test(
    message,
  )
}

export interface CapacityResult {
  ok: boolean
  error?: string
  started?: boolean // output or a tool action was already produced: never replay it automatically
}

/** One delayed retry, then one explicitly chosen fallback. Never changes provider or credentials. */
export async function recoverModelCapacity<T extends CapacityResult>(options: {
  model: string
  fallback?: string
  attempt: (model: string) => Promise<T>
  wait: () => Promise<void>
  notice: (message: string) => void
}): Promise<T> {
  let result = await options.attempt(options.model)
  const retryable = () => !result.ok && !result.started && isModelCapacityError(result.error)
  if (!retryable()) return result
  options.notice('The OpenAI model is busy. Retrying once…')
  await options.wait()
  result = await options.attempt(options.model)
  if (!retryable() || !options.fallback || options.fallback === options.model) return result
  options.notice(`OpenAI capacity fallback: using ${options.fallback} for this conversation.`)
  return options.attempt(options.fallback)
}
