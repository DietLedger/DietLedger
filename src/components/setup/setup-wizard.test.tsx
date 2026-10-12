import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

function wrapWithQueryClient(ui: React.ReactElement) {
  return <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>
}

// Mutable auth state shared with the useAuth mock. register() flips it so the
// setup wizard's `isAuthenticated`-derived step list changes after the account
// step completes — the real behaviour that the account -> basics transition
// depends on.
let authState: {
  user: { id: string; email: string; displayName: string; isAdmin?: boolean } | null
  isAuthenticated: boolean
} = { user: null, isAuthenticated: false }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/setup',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: authState.user,
    isLoading: false,
    isAuthenticated: authState.isAuthenticated,
    login: vi.fn(),
    // Mirrors the real hook: a successful registration authenticates the
    // session (sets the user), so isAuthenticated becomes true on the next read.
    register: vi.fn(async (email: string, _password: string, displayName: string) => {
      authState = {
        user: { id: 'admin-1', email, displayName, isAdmin: true },
        isAuthenticated: true,
      }
    }),
    logout: vi.fn(),
  }),
}))

// Named spies for the instance + settings mutations so finish behaviour can
// be asserted. Onboarding completion is two distinct concerns:
//   - completeOnboarding()  -> instance_meta (global / instance-wide)
//   - updateSettings({onboardingComplete:true}) -> user_settings (per-user)
// The finish test below proves the per-user flag is recorded against the
// authenticated user's settings and is NOT conflated into the global call.
const completeOnboardingMutate = vi.fn()
const setRegistrationMutate = vi.fn()
const settingsMutate = vi.fn()

vi.mock('@/hooks/use-instance', () => ({
  // Fresh install: not complete, no users yet -> account step is shown.
  useInstanceState: () => ({
    data: { onboardingComplete: false, registrationEnabled: true, hasUsers: false },
    isLoading: false,
  }),
  useCompleteOnboarding: () => ({ mutate: completeOnboardingMutate }),
  useSetRegistrationEnabled: () => ({ mutate: setRegistrationMutate }),
}))

vi.mock('@/hooks/use-settings', () => ({
  useUpdateSettings: () => ({ mutate: settingsMutate }),
}))

vi.mock('@/hooks/use-nutrition', () => ({
  useCreateNutritionProfile: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/lib/api-client', () => ({
  getApiClient: () => ({
    startFoodSeed: vi.fn(),
    getSeedJob: vi.fn(),
  }),
}))

describe('SetupWizard — account -> basics transition', () => {
  beforeEach(() => {
    authState = { user: null, isAuthenticated: false }
    settingsMutate.mockReset()
    settingsMutate.mockImplementation((_args: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    )
  })

  it('lands on the basics step after creating the admin account (not registration)', { timeout: 15000 }, async () => {
    const user = userEvent.setup()
    const { SetupWizard } = await import('@/components/setup/setup-wizard')
    const { container } = render(wrapWithQueryClient(<SetupWizard />))

    // welcome -> account
    await user.click(screen.getByRole('button', { name: /get started/i }))

    // Fill the admin account form with valid values.
    await user.type(screen.getByPlaceholderText('Admin'), 'Admin User')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'admin@example.com')
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'supersecret')
    const [passwordInput, confirmInput] = container.querySelectorAll('input[type="password"]')
    expect(confirmInput).toBeDefined()
    await user.type(confirmInput as HTMLElement, 'supersecret')

    // Submit the account step.
    await user.click(screen.getByRole('button', { name: /continue/i }))

    // After account creation the session is authenticated. The wizard must move
    // into the basics step (units/theme). The regression is that, because
    // `isAuthenticated` flips and 'account' drops out of the steps list, a
    // positional step index overshoots straight to 'registration', skipping
    // 'basics' entirely.
    await waitFor(() => {
      expect(screen.getByText('Choose your preferences')).toBeInTheDocument()
    })
    expect(screen.queryByText('Registration policy')).not.toBeInTheDocument()
  })
})

describe('SetupWizard — finish behaviour and per-user onboarding completion', () => {
  beforeEach(() => {
    authState = { user: null, isAuthenticated: false }
    settingsMutate.mockReset()
    settingsMutate.mockImplementation((_args: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    )
    completeOnboardingMutate.mockReset()
    completeOnboardingMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    )
    setRegistrationMutate.mockReset()
    setRegistrationMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    )
  })

  // Reaching the finish step requires an authenticated admin (the account step
  // is dropped once authenticated). Advancing through basics/registration needs
  // their mutations to resolve onSuccess (wired in beforeEach).
  it('on finish, records global instance completion AND the admin user\'s per-user completion separately', async () => {
    authState = {
      user: { id: 'admin-1', email: 'admin@example.com', displayName: 'Admin', isAdmin: true },
      isAuthenticated: true,
    }
    const user = userEvent.setup()
    const { SetupWizard } = await import('@/components/setup/setup-wizard')
    render(wrapWithQueryClient(<SetupWizard />))

    // Authenticated admin: steps are welcome -> basics -> registration ->
    // usda -> demo -> profile -> finish (no account step).
    await user.click(await screen.findByRole('button', { name: /get started/i }))
    await user.click(await screen.findByRole('button', { name: /^continue$/i })) // basics
    await user.click(await screen.findByRole('button', { name: /^continue$/i })) // registration
    await user.click(await screen.findByRole('button', { name: /^continue$/i })) // usda (skip)
    await user.click(await screen.findByRole('button', { name: /^continue$/i })) // demo (skip)
    await user.click(await screen.findByRole('button', { name: /skip/i })) // profile (skip)

    // Confirm we actually reached the finish step before finishing.
    await waitFor(() => {
      expect(screen.getByText(/you're all set/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /finish setup/i }))

    // 1) Global / instance-wide completion: completeOnboarding() persists to
    //    instance_meta (a single shared row). Called exactly once.
    await waitFor(() => {
      expect(completeOnboardingMutate).toHaveBeenCalledTimes(1)
    })

    // 2) Per-user completion: the admin's own onboardingComplete flag is
    //    recorded against their user_settings row (keyed by user_id) via the
    //    settings mutation — a SEPARATE mechanism from the global call. This is
    //    what keeps onboarding completion per-user instead of globally/shared.
    expect(settingsMutate).toHaveBeenCalledWith(
      { onboardingComplete: true },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    // 3) The two concerns are not conflated: the global instance call must NOT
    //    carry the per-user flag (that would share it incorrectly). It is
    //    invoked with no per-user payload.
    expect(completeOnboardingMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(completeOnboardingMutate).not.toHaveBeenCalledWith(
      { onboardingComplete: true },
      expect.anything(),
    )
  })
})
