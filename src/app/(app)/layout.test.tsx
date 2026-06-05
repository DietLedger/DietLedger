import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/recipes',
  useSearchParams: () => new URLSearchParams(),
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

vi.mock('@/lib/api-client', () => ({
  getApiClient: () => ({
    login: vi.fn(),
    register: vi.fn(),
    getRecipes: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  }),
}))

describe('App Shell Smoke Test', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders the app layout with navigation when authenticated', async () => {
    const { default: AppLayout } = await import('@/app/(app)/layout')
    render(
      <AppLayout>
        <div>Test Page Content</div>
      </AppLayout>
    )
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
    render(
      <AppLayout>
        <div>Test Page Content</div>
      </AppLayout>
    )
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
    const { container } = render(
      <AppLayout>
        <div>Test Page Content</div>
      </AppLayout>
    )
    expect(container.innerHTML).toBe('')
  })
})
