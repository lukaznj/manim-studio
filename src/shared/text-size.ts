export const INTERFACE_SIZES = [75, 90, 100, 110, 125, 150] as const
export const CHAT_TEXT_SIZES = [12, 13, 14, 16, 18, 20, 22, 24] as const

export function interfaceSize(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(75, Math.min(150, Math.round(value))) : 100
}
export function chatTextSize(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(12, Math.min(24, Math.round(value))) : 13
}
export function stepInterfaceSize(value: number | undefined, direction: -1 | 1): number {
  const current = interfaceSize(value)
  return direction > 0 ? INTERFACE_SIZES.find((size) => size > current) ?? 150 : [...INTERFACE_SIZES].reverse().find((size) => size < current) ?? 75
}
