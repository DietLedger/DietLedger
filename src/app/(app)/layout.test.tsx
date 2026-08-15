import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function wrapWithQueryClient(ui: React.ReactElement) {
  return <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/recipes',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'test-id', email: 'test@example.com', displayName: 'Test User' },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/use-instance', () => ({
  useInstanceState: () => ({
    data: { onboardingComplete: true, registrationEnabled: true, hasUsers: true },
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-settings', () => ({
  useAppSettings: () => ({
    data: { onboardingComplete: true, unitSystem: 'imperial', theme: 'light' },
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-secrets', () => ({
  useFDAKey: () => ({ data: 'DEMO_KEY' }),
  useSetFDAKey: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-recipes', () => ({
  useRecipes: () => ({ data: [] }),
}))

vi.mock('@/hooks/use-dietary', () => ({
  useDietaryProfiles: () => ({ profiles: [], activeProfileId: null }),
}))

vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    themeId: 'default',
    setTheme: vi.fn(),
    themes: [{ id: 'default', name: 'Default', description: '', light: {}, dark: {} }],
    mounted: true,
  }),
}))

vi.mock('@/components/nutrition/log-weight-dialog', () => ({
  LogWeightDialog: () => null,
}))

vi.mock('@/lib/api-client', () => ({
  getApiClient: () => ({
    login: vi.fn(),
    register: vi.fn(),
    getRecipes: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, perPage: 100, totalPages: 0 }),
    getSecrets: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({}),
  }),
}))

describe('App Shell Smoke Test', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders the app layout with navigation when authenticated', { timeout: 15000 }, async () => {
    const { default: AppLayout } = await import('@/app/(app)/layout')
    render(wrapWithQueryClient(
      <AppLayout>
        <div>Test Page Content</div>
      </AppLayout>
    ))
    expect(screen.getByText('Test Page Content')).toBeInTheDocument()
  })

  it('shows loading state when auth is loading', async () => {
    vi.doMock('@/hooks/use-auth', () => ({
      useAuth: () => ({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      }),
      AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }))
    const { default: AppLayout } = await import('@/app/(app)/layout')
    render(wrapWithQueryClient(
      <AppLayout>
        <div>Test Page Content</div>
      </AppLayout>
    ))
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders nothing when not authenticated and not loading', async () => {
    vi.doMock('@/hooks/use-auth', () => ({
      useAuth: () => ({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      }),
      AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }))
    const { default: AppLayout } = await import('@/app/(app)/layout')
    const { container } = render(wrapWithQueryClient(
      <AppLayout>
        <div>Test Page Content</div>
      </AppLayout>
    ))
    expect(container.innerHTML).toBe('')
  })
})
