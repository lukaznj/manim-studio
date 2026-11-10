import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Chromium doesn't report Linux battery state. Look for an online system power supply. */
export function linuxHasExternalPower(root = '/sys/class/power_supply'): boolean {
  const attribute = (supply: string, name: string): string | undefined => {
    try { return readFileSync(join(root, supply, name), 'utf8').trim() } catch { return undefined }
  }
  try {
    return readdirSync(root).some((supply) =>
      attribute(supply, 'type') !== 'Battery' && attribute(supply, 'scope') !== 'Device' && Number(attribute(supply, 'online')) > 0,
    )
  } catch { return false }
}
