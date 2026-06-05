import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGoApiClientInstance = {
  login: vi.fn(),
  register: vi.fn(),
  getRecipes: vi.fn(),
  refreshToken: vi.fn(),
}

function setupMocks() {
  vi.doMock('./write-queue', () => ({
    writeQueue: { init: vi.fn() },
  }))
  vi.doMock('./read-cache', () => ({
    readCache: { init: vi.fn() },
    DEFAULT_TTL_LIST: 60_000,
    DEFAULT_TTL_ITEM: 120_000,
  }))
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

  it('does not select LocalApiClient even when local-only env is set', async () => {
    process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY = 'true'

    let localClientConstructed = false
    vi.doMock('./api-client-local', () => ({
      LocalApiClient: class {
        constructor() { localClientConstructed = true }
      },
    }))

    const { getApiClient, resetApiClient } = await import('./api-client')
    resetApiClient()

    getApiClient()

    expect(localClientConstructed).toBe(false)
  })
})

describe('AuthProvider isAuthenticated', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY
  })

  it('does not bypass auth when NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY is true', async () => {
    process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY = 'true'

    const { useAuth, AuthProvider } = await import('@/hooks/use-auth')

    let authValue: ReturnType<typeof useAuth> | null = null

    function TestConsumer() {
      authValue = useAuth()
      return null
    }

    const { render } = await import('@testing-library/react')
    const React = await import('react')

    render(
      React.createElement(AuthProvider, null, React.createElement(TestConsumer))
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
