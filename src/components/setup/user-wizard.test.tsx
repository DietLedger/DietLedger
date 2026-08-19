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

// Hoisted so the vi.mock factory (which Vitest hoists above imports) can
// reference the spy; tests assert the post-completion navigation target.
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/welcome',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/use-auth', () => ({
  // Non-admin: admins configured profile + preferences during instance setup
  // and are routed away from the per-user wizard.
  useAuth: () => ({
    user: { id: 'user-1', email: 'user@example.com', displayName: 'User' },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-instance', () => ({
  // Instance setup already finished; only per-user onboarding remains.
  useInstanceState: () => ({
    data: { onboardingComplete: true, registrationEnabled: true, hasUsers: true },
    isLoading: false,
  }),
}))

const settingsMutate = vi.fn()
vi.mock('@/hooks/use-settings', () => ({
  useUpdateSettings: () => ({ mutate: settingsMutate }),
}))

const createProfileMutate = vi.fn()
vi.mock('@/hooks/use-nutrition', () => ({
  useCreateNutritionProfile: () => ({ mutate: createProfileMutate }),
}))

describe('UserWizard — per-user onboarding completion', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    settingsMutate.mockReset()
    settingsMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    )
    createProfileMutate.mockReset()
    createProfileMutate.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    )
  })

  // Skip = complete now, save nothing optional. Guards that skipping never
  // writes a profile or preference payload — only the completion flag.
  it('skip completes immediately with only the onboarding flag', async () => {
    const user = userEvent.setup()
    const { UserWizard } = await import('@/components/setup/user-wizard')
    render(wrapWithQueryClient(<UserWizard />))

    await user.click(screen.getByRole('button', { name: /skip/i }))

    await waitFor(() => {
      expect(settingsMutate).toHaveBeenCalledTimes(1)
    })
    expect(settingsMutate).toHaveBeenCalledWith(
      { onboardingComplete: true },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(createProfileMutate).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/')
    })
  })

  // Finish = the chosen unit system and theme are persisted together with
  // the completion flag in one settings write.
  it('finish persists chosen unit and theme preferences together with completion', { timeout: 15000 }, async () => {
    const user = userEvent.setup()
    const { UserWizard } = await import('@/components/setup/user-wizard')
    render(wrapWithQueryClient(<UserWizard />))

    // welcome -> profile (leave empty; profile is optional) -> preferences
    await user.click(screen.getByRole('button', { name: /get started/i }))
    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    await waitFor(() => {
      expect(screen.getByText('Your preferences')).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText('Metric (kg, g)'))
    await user.click(screen.getByLabelText('Dark'))
    await user.click(screen.getByRole('button', { name: /^finish$/i }))

    await waitFor(() => {
      expect(settingsMutate).toHaveBeenCalledWith(
        { onboardingComplete: true, unitSystem: 'metric', theme: 'dark' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      )
    })
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/')
    })
  })

  // The optional profile feeds BMI/BMR/TDEE (nutrition-domain inputs), so
  // guard the imperial -> metric height conversion at creation time.
  it('creates the optional profile with imperial height converted to centimetres', { timeout: 15000 }, async () => {
    const user = userEvent.setup()
    const { UserWizard } = await import('@/components/setup/user-wizard')
    render(wrapWithQueryClient(<UserWizard />))

    await user.click(screen.getByRole('button', { name: /get started/i }))
    await waitFor(() => {
      expect(screen.getByText('Create a profile (optional)')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('e.g. You, or a family member'), 'Me')
    await user.type(screen.getByPlaceholderText('ft'), '5')
    await user.type(screen.getByPlaceholderText('in'), '10')
    await user.click(screen.getByRole('button', { name: /^continue$/i }))

    await waitFor(() => {
      expect(createProfileMutate).toHaveBeenCalledTimes(1)
    })
    const payload = createProfileMutate.mock.calls[0][0] as {
      name: string
      heightCm: number | null
      birthDate: string | null
      goalWeightKg: number | null
    }
    expect(payload.name).toBe('Me')
    // 5 ft 10 in = 70 in = 177.8 cm
    expect(payload.heightCm).toBeCloseTo(177.8, 6)
    expect(payload.birthDate).toBeNull()
    expect(payload.goalWeightKg).toBeNull()
    // The wizard advances to preferences after a successful save.
    await waitFor(() => {
      expect(screen.getByText('Your preferences')).toBeInTheDocument()
    })
  })
})
