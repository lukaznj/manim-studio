// A render worker's pairing code (python/studio_worker): "msw1." + base64url of {"url", "token"}.
// Also takes an address and a token typed by hand: "http://acer:7400 TOKEN".

export function parsePairingCode(input: string): { url: string; token: string } {
  const text = input.trim()
  let url = ''
  let token = ''
  if (text.startsWith('msw1.')) {
    try {
      const b64 = text.slice(5).replace(/-/g, '+').replace(/_/g, '/')
      const json = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { url?: unknown; token?: unknown }
      url = String(json.url ?? '')
      token = String(json.token ?? '')
    } catch {
      throw new Error('That pairing code is incomplete. Copy the whole line the render server printed (it starts with msw1.).')
    }
  } else [url, token] = text.split(/\s+/)
  if (!/^https?:\/\/[^\s/]+/.test(url) || !token) throw new Error('Paste the pairing code the render server printed (it starts with msw1.).')
  return { url: url.replace(/\/+$/, ''), token }
}
