import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGoApiClientInstance = {
  login: vi.fn(),
  register: vi.fn(),
  getRecipes: vi.fn(),
  refreshToken: vi.fn(),
}

function setupMocks() {
  vi.doMock('./api-client-go', () => ({
    GoApiClient: class {
      constructor() { return mockGoApiClientInstance }
    },
  }))
}

describe('getApiClient', () => {
  beforeEach(() => {
    vi.resetModules()
    setupMocks()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY
  })

  it('returns GoApiClient always, ignoring NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY', async () => {
    process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY = 'true'

    const { getApiClient, resetApiClient } = await import('./api-client')
    resetApiClient()

    const client = getApiClient()

    expect(client).toBe(mockGoApiClientInstance)
  })

  it('returns GoApiClient when NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY is 1', async () => {
    process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY = '1'

    const { getApiClient, resetApiClient } = await import('./api-client')
    resetApiClient()

    const client = getApiClient()

    expect(client).toBe(mockGoApiClientInstance)
  })

  it('returns the same client instance on repeated calls', async () => {
    const { getApiClient, resetApiClient } = await import('./api-client')
    resetApiClient()

    const a = getApiClient()
    const b = getApiClient()

    expect(a).toBe(b)
  })

  it('always uses GoApiClient (no local client exists)', async () => {
    vi.doUnmock('./api-client-go')
    process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY = 'true'

    const { getApiClient, resetApiClient } = await import('./api-client')
    resetApiClient()

    const { GoApiClient } = await import('./api-client-go')
    const client = getApiClient()

    expect(client).toBeInstanceOf(GoApiClient)
  })
})

describe('AuthProvider isAuthenticated', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY
  })

  it('does not bypass auth when NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY is true', { timeout: 15000 }, async () => {
    process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY = 'true'

    const { useAuth, AuthProvider } = await import('@/hooks/use-auth')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')

    let authValue: ReturnType<typeof useAuth> | null = null

    function TestConsumer() {
      authValue = useAuth()
      return null
    }

    const { render } = await import('@testing-library/react')
    const React = await import('react')

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AuthProvider, null, React.createElement(TestConsumer))
      )
    )

    expect(authValue!.isAuthenticated).toBe(false)
  })
})

describe('proxy local-only guard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY
    vi.restoreAllMocks()
  })

  it('proxies matched API routes regardless of NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY', async () => {
    process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY = 'true'

    const { proxy } = await import('../proxy')

    const request = {
      nextUrl: new URL('http://localhost:3000/api/health'),
      headers: new Headers(),
      method: 'GET',
    } as any

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchSpy)

    await proxy(request)

    expect(fetchSpy).toHaveBeenCalled()
  })

  it('passes through non-API routes without proxying', async () => {
    const { proxy } = await import('../proxy')

    const request = {
      nextUrl: new URL('http://localhost:3000/recipes'),
      headers: new Headers(),
      method: 'GET',
    } as any

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { NextResponse } = await import('next/server')
    const result = await proxy(request)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(NextResponse)
  })
})

describe('GoApiClient request error surfacing', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./api-client-go')
    vi.doUnmock('./storage')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws on server error responses without queueing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    ))

    const { GoApiClient } = await import('./api-client-go')
    const client = new GoApiClient('http://localhost:8080')

    await expect(client.getRecipes()).rejects.toThrow('Internal Server Error')
  })

  it('throws on 4xx responses without queueing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    ))

    const { GoApiClient } = await import('./api-client-go')
    const client = new GoApiClient('http://localhost:8080')

    await expect(client.getRecipes()).rejects.toThrow('Not Found')
  })

  it('throws on network failure without queueing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const { GoApiClient } = await import('./api-client-go')
    const client = new GoApiClient('http://localhost:8080')

    await expect(client.getRecipes()).rejects.toThrow('Failed to fetch')
  })
})
