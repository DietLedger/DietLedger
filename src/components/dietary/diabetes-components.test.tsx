import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DietaryFilters } from './dietary-filters';
import { DietaryProfileEditor } from './dietary-profile-editor';
import { ComplianceReport } from './compliance-report';
import { ThresholdAlerts } from '../nutrition/threshold-alerts';
import { DietaryBadges } from '../recipe/dietary-badges';
import type { DietaryProfileRecord, FoodLogEntryRecord } from '@/lib/types';
import { MEDICAL_MEAL_TEMPLATES } from '@/data/medical-meal-templates';

const state = vi.hoisted(() => ({ update: vi.fn(), profiles: [] as any[] }));
vi.mock('@/hooks/use-dietary', () => ({ useDietaryProfiles: () => ({ profiles: state.profiles, activeProfileId: 'p' }), useCreateDietaryProfile: () => ({ mutateAsync: vi.fn() }), useUpdateDietaryProfile: () => ({ mutateAsync: state.update }), useDeleteDietaryProfile: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ getNutritionProfiles: async () => [], getBrandKits: async () => [] }) }));
const profile = { id:'p', name:'Renamed', allergens:[], dietaryTags:['diabetesAware'], nutrientThresholds:[{ nutrient:'dietaryFiber', per1000KcalMin:14, alertLevel:'warning' }, { nutrient:'sodium', dailyMax:2300, perMealMax:500, alertLevel:'warning' }], isActive:false } as unknown as DietaryProfileRecord;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('diabetes-aware components', () => {
  it('offers opt-in profiles by tag and clears selection without guidance', () => {
    state.profiles = [profile]; const change = vi.fn();
    const { rerender } = render(<DietaryFilters activeTags={[]} onTagsChange={vi.fn()} excludeAllergens={false} onExcludeAllergensChange={vi.fn()} diabetesProfileId={null} onDiabetesProfileChange={change} />);
    fireEvent.click(screen.getByRole('button', {name:/dietary filters/i}));
    fireEvent.click(screen.getByRole('button', {name:'Diabetic'}));
    expect(change).toHaveBeenCalledWith('p');
    rerender(<DietaryFilters activeTags={[]} onTagsChange={vi.fn()} excludeAllergens={false} onExcludeAllergensChange={vi.fn()} diabetesProfileId="p" onDiabetesProfileChange={change} />);
    expect(screen.queryByText(/not.*certification/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Guidance and sources')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/clear/i})); expect(change).toHaveBeenCalledWith(null);
  });
  it('shows one Diabetic control for multiple eligible profiles and selects an existing profile', () => {
    state.profiles = [{...profile, id:'other', name:'Other'}, profile]; const change = vi.fn();
    render(<DietaryFilters activeTags={[]} onTagsChange={vi.fn()} excludeAllergens={false} onExcludeAllergensChange={vi.fn()} diabetesProfileId={null} onDiabetesProfileChange={change} />);
    fireEvent.click(screen.getByRole('button', {name:/dietary filters/i}));
    fireEvent.click(screen.getByRole('button', {name:'Diabetic'}));
    expect(change).toHaveBeenCalledWith('p');
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });
  it('saves cleared density and serving limits as absent, not zero', async () => {
    state.update.mockResolvedValue({}); render(<DietaryProfileEditor profile={profile} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('dietaryFiber Minimum g per 1,000 kcal'), {target:{value:''}});
    fireEvent.change(screen.getByLabelText('sodium Per serving max (mg)'), {target:{value:''}});
    fireEvent.click(screen.getByRole('button',{name:'Update Profile'}));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const ts = state.update.mock.calls[0][0].data.nutrientThresholds;
    expect(ts[0]).not.toHaveProperty('per1000KcalMin'); expect(ts[1]).not.toHaveProperty('perMealMax');
    expect(screen.getByRole('link',{name:/ADA 2026/i})).toHaveAttribute('href','https://pmc.ncbi.nlm.nih.gov/articles/PMC12690188/');
  });
  it('does not turn recipe criteria into daily alerts and supports canonical added sugars', () => {
    const entries = [{ dietaryFiber:20, sodium:700, addedSugars:8 }] as FoodLogEntryRecord[];
    const p = {...profile,nutrientThresholds:[{nutrient:'dietaryFiber',per1000KcalMin:14,alertLevel:'warning'},{nutrient:'sodium',perMealMax:500,alertLevel:'warning'},{nutrient:'addedSugars',dailyMax:10,alertLevel:'warning'}]} as DietaryProfileRecord;
    render(<ThresholdAlerts entries={entries} dietaryProfile={p}/>);
    expect(screen.getByText(/8g addedSugars.*80%/)).toBeInTheDocument(); expect(screen.queryByText(/sodium/)).not.toBeInTheDocument(); expect(screen.queryByText(/dietaryFiber/)).not.toBeInTheDocument();
  });
  it('never claims name-only compliance for recipe nutrition criteria', () => {
    const {rerender} = render(<DietaryBadges ingredients={[{name:'chicken'}]} profile={profile} compact/>);
    expect(screen.getByText('Nutrition not assessed')).toBeInTheDocument();
    rerender(<DietaryBadges ingredients={[{name:'chicken'}]} profile={{...profile,dietaryTags:[],nutrientThresholds:[{nutrient:'sodium',perMealMax:500,alertLevel:'warning'}]}} compact/>);
    expect(screen.getByText('Nutrition not assessed')).toBeInTheDocument();
  });
  it('preserves name-only compliance for profiles with only daily limits', () => {
    render(<DietaryBadges ingredients={[{name:'chicken'}]} profile={{...profile,dietaryTags:[],nutrientThresholds:[{nutrient:'sodium',dailyMax:2300,alertLevel:'warning'}]}} compact/>);
    expect(screen.getByText('Compliant')).toBeInTheDocument();
  });
  it('labels the diabetic sample numbers as illustrative rather than universal', () => {
    const sample = MEDICAL_MEAL_TEMPLATES.find(t => t.dietType === 'Diabetic')!;
    expect(sample.description).toMatch(/illustrative/i);
    expect(sample.notes.join(' ')).not.toMatch(/30-45g|25-30g/);
  });
  it('reports basis and units for configured thresholds', async () => {
    state.profiles=[profile]; render(<ComplianceReport/>);
    expect(await screen.findByText('14 g / 1,000 kcal')).toBeInTheDocument();
    expect(screen.getByText('500 mg')).toBeInTheDocument(); expect(screen.getByText('2300 mg')).toBeInTheDocument();
    expect(screen.getByText(/per serving max/i)).toBeInTheDocument();
  });
});
