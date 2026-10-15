// The band kept clear for viewers' subtitles (ADR 0027), as fractions of the frame, for the
// preview's outline. python/studio/__init__.py holds the same sizes in manim units.
import type { Aspect } from './types'

export function captionBand(aspect: Aspect): { bottom: number; right: number } {
  return aspect === '9:16' ? { bottom: 2.6 / 14.2, right: 0.9 / 8 } : { bottom: 1.1 / 8, right: 0 }
}
