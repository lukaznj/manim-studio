import { agentConcurrency, WorkSlots } from '../shared/work-slots'
import { getSettings } from './settings'

const slots = new WorkSlots()
export const updateAgentCapacity = (): void => slots.setCapacity(agentConcurrency(getSettings().agentConcurrency))
export function agentSlot(signal: AbortSignal, step: string, onWait: () => void): Promise<() => void> {
  updateAgentCapacity()
  // A checked/fixed video is closest to export. Starting more scripts can wait.
  return slots.acquire(signal, step === 'Script' ? 2 : step === 'Video' ? 1 : 0, onWait)
}
