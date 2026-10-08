import type { StudioApi } from '../../../shared/types'

declare global {
  interface Window {
    studio: StudioApi
  }
}

export const api = window.studio
