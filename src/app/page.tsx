'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRecipeStore, type Recipe } from '@/lib/recipe-store';
import { useBookStore } from '@/lib/book-store';
import { useMealPlanStore } from '@/lib/meal-plan-store';
import { getDayEntriesByMealPlanId, type DayPlanEntryRecord } from '@/lib/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format, startOfWeek } from 'date-fns';
import {
  ChefHat,
  Salad,
  BookOpen,
  ShoppingCart,
  UtensilsCrossed,
  ArrowRight,
  Clock,
  BarChart3,
  Sparkles,
  CalendarDays,
  TrendingUp,
  Layers,
  Lock,
} from 'lucide-react';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function WelcomePage() {
  const { recipes, fetchRecipes } = useRecipeStore();
  const { books, fetchBooks } = useBookStore();
  const { mealPlans, fetchMealPlans } = useMealPlanStore();
  const [todayEntries, setTodayEntries] = useState<DayPlanEntryRecord[]>([]);

  useEffect(() => {
    fetchRecipes();
    fetchBooks();
    fetchMealPlans();
  }, [fetchRecipes, fetchBooks, fetchMealPlans]);

  const recipeCount = recipes.length;
  const bookCount = books.length;

  const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const currentWeekPlan = useMemo(
    () => mealPlans.find((p) => p.weekStart === currentWeekMonday),
    [mealPlans, currentWeekMonday]
  );

  useEffect(() => {
    async function loadTodayEntries() {
      if (!currentWeekPlan) { setTodayEntries([]); return; }
      const entries = await getDayEntriesByMealPlanId(currentWeekPlan.id);
      setTodayEntries(entries.filter((e) => e.date === todayStr));
    }
    loadTodayEntries();
  }, [currentWeekPlan, todayStr]);

  const avgIngredientCount = useMemo(() => {
    if (recipeCount === 0) return 0;
    const total = recipes.reduce((sum, r) => sum + r.ingredients.length, 0);
    return (total / recipeCount).toFixed(1);
  }, [recipes, recipeCount]);

  const latestRecipes = useMemo(
    () =>
      [...recipes]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 10),
    [recipes]
  );

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 text-white">
              <ChefHat className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
              NutriLabel
            </h1>
          </Link>
          <Link href="/recipes">
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              Go to App
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-stone-900 mb-1">
            Welcome to NutriLabel
          </h2>
          <p className="text-stone-500 text-sm">
            Your recipe nutrition label toolkit. Quick access to everything
            below.
          </p>
        </section>

        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Tile
              href="/recipes"
              icon={Salad}
              label="Recipes"
              count={recipeCount}
              active
            />
            <Tile
              href={`/meal-plans/grocery-list/${currentWeekMonday}`}
              icon={ShoppingCart}
              label="Grocery List"
              active
            />
            <Tile
              href="/kitchen-helper"
              icon={UtensilsCrossed}
              label="Kitchen Helper"
              active
            />
            <Tile
              href="/books"
              icon={BookOpen}
              label="Books"
              count={bookCount}
              active
            />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h3 className="text-lg font-semibold text-stone-900 mb-4 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-emerald-600" />
              Today&apos;s Meal Plan
            </h3>
            <Card>
              {currentWeekPlan ? (
                <CardContent className="py-6 px-6">
                  <div className="flex items-center justify-between mb-3">
                    <Link
                      href={`/meal-plans/${currentWeekMonday}`}
                      className="text-sm font-medium text-stone-700 hover:text-emerald-600 transition-colors"
                    >
                      Week of {currentWeekPlan.weekStart}
                    </Link>
                    <Link href="/meal-plans" className="text-xs text-emerald-600 hover:underline">
                      View all
                    </Link>
                  </div>
                  {todayEntries.length > 0 ? (
                    <div className="space-y-1.5">
                      {todayEntries.map((entry) => {
                        const recipe = recipes.find((r) => r.id === entry.recipeId);
                        return (
                          <Link
                            key={entry.id}
                            href={`/kitchen-helper?recipeId=${entry.recipeId}`}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-emerald-50 transition-colors"
                          >
                            <span className="text-xs text-stone-500">{recipe?.name || 'Unknown Recipe'}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <Link
                      href={`/meal-plans/${currentWeekMonday}`}
                      className="text-xs text-stone-400 hover:text-emerald-600 transition-colors"
                    >
                      No meals planned for today — add some
                    </Link>
                  )}
                </CardContent>
              ) : (
                <CardContent className="py-8 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
                    <CalendarDays className="w-6 h-6 text-stone-400" />
                  </div>
                  <p className="text-sm text-stone-500">No meal plan for this week</p>
                  <Link
                    href="/meal-plans"
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    Create a meal plan
                  </Link>
                </CardContent>
              )}
            </Card>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-stone-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              Latest Recipes
            </h3>
            <Card>
              {latestRecipes.length === 0 ? (
                <CardContent className="py-8 text-center text-stone-400 text-sm">
                  No recipes yet.{' '}
                  <Link
                    href="/recipes"
                    className="text-emerald-600 hover:underline"
                  >
                    Create one
                  </Link>
                </CardContent>
              ) : (
                <ScrollArea className="h-[320px]">
                  <div className="divide-y">
                    {latestRecipes.map((r) => (
                      <Link
                        key={r.id}
                        href={`/recipes?recipeId=${r.id}`}
                        className="flex items-center justify-between px-6 py-3 hover:bg-stone-50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">
                            {r.name || 'Untitled Recipe'}
                          </p>
                          <p className="text-xs text-stone-400">
                            {r.ingredients.length} ingredient
                            {r.ingredients.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="text-xs text-stone-400 ml-4 shrink-0">
                          {formatDate(r.createdAt)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </section>
        </div>

        <section>
          <h3 className="text-lg font-semibold text-stone-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            Stats Dashboard
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={Salad}
              label="Recipes"
              value={String(recipeCount)}
            />
            <StatCard
              icon={CalendarDays}
              label="Meal Plans"
              value={String(mealPlans.length)}
            />
            <StatCard
              icon={Sparkles}
              label="Recipe Synergies"
              value="0"
              subtitle="Coming Soon"
            />
            <StatCard
              icon={Layers}
              label="Avg Ingredients"
              value={recipeCount > 0 ? avgIngredientCount : '—'}
              subtitle="per recipe"
            />
          </div>
        </section>
      </main>

      <footer className="border-t bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-stone-400">
          <span>NutriLabel — Nutrition Label Toolkit</span>
          <span>Local Storage &middot; No data leaves your device</span>
        </div>
      </footer>
    </div>
  );
}

function Tile({
  href,
  icon: Icon,
  label,
  count,
  active,
  comingSoon,
}: {
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  active?: boolean;
  comingSoon?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between w-full">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            active
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-stone-100 text-stone-400'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        {comingSoon && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Lock className="w-2.5 h-2.5" />
            Soon
          </Badge>
        )}
      </div>
      <div className="mt-3">
        <p
          className={`font-semibold text-sm ${
            active ? 'text-stone-900' : 'text-stone-400'
          }`}
        >
          {label}
        </p>
        {active && count !== undefined && (
          <p className="text-xs text-stone-400">
            {count} item{count !== 1 ? 's' : ''}
          </p>
        )}
        {comingSoon && (
          <p className="text-xs text-stone-400">Coming Soon</p>
        )}
      </div>
      {active && (
        <ArrowRight className="w-4 h-4 text-stone-300 mt-2 self-end" />
      )}
    </>
  );

  if (active && href) {
    return (
      <Link href={href}>
        <Card className="h-full hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer py-4">
          <CardContent className="flex flex-col">{inner}</CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Card className="h-full opacity-60 py-4">
      <CardContent className="flex flex-col">{inner}</CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col items-center text-center gap-1">
        <Icon className="w-4 h-4 text-emerald-600 mb-1" />
        <p className="text-2xl font-bold text-stone-900">{value}</p>
        <p className="text-xs text-stone-500">{label}</p>
        {subtitle && (
          <p className="text-[10px] text-stone-400">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
