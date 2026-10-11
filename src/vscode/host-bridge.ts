import type { HostRequest, HostResults, ToHost, ToWebview } from './protocol'

/** The one function VS Code gives a webview for talking to its extension. */
export interface VsCodeApi {
  postMessage(message: unknown): void
}

/** Where messages from the host arrive: `window` in the webview, a stub in tests. */
export interface MessageSource {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

type Listener = (message: ToWebview) => void

/** Typed messaging with the extension, plus request/response on top of it. */
export interface HostBridge {
  post(message: ToHost): void
  /** Listen to messages from the host. Returns a function that stops listening. */
  subscribe(listener: Listener): () => void
  /** Ask the host for something and wait for its answer. */
  request<K extends HostRequest['kind']>(request: Extract<HostRequest, { kind: K }>): Promise<HostResults[K]>
}

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
}

export function createHostBridge(api: VsCodeApi, source: MessageSource): HostBridge {
  const listeners = new Set<Listener>()
  const pending = new Map<number, Pending>()
  let nextId = 1

  source.addEventListener('message', ({ data }) => {
    const message = data as ToWebview
    if (message?.type === 'response') {
      const waiting = pending.get(message.id)
      pending.delete(message.id)
      if (message.error !== undefined) waiting?.reject(new Error(message.error))
      else waiting?.resolve(message.result)
      return
    }
    for (const listener of listeners) listener(message)
  })

  return {
    post: (message) => api.postMessage(message),

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    request(request) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as Pending['resolve'], reject })
        api.postMessage({ type: 'request', id, request } satisfies ToHost)
      })
    },
  }
}
