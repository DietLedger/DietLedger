'use client';

import { useState, useEffect } from 'react';
import { getUnitSystem, setUnitSystem, type UnitSystem } from '@/lib/unit-conversion';

export function useUnitSystem() {
  const [system, setSystem] = useState<UnitSystem>('imperial');

  useEffect(() => {
    setSystem(getUnitSystem());
    const handler = (e: StorageEvent) => {
      if (e.key === 'nutrilabel-unit-system') {
        setSystem(getUnitSystem());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const change = (s: UnitSystem) => {
    setUnitSystem(s);
    setSystem(s);
  };

  return { system, setUnitSystem: change };
}

export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

export function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

export function inchesToCm(inches: number): number {
  return inches * 2.54;
}

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = cmToInches(cm);
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return inchesToCm(ft * 12 + inches);
}

export function displayWeight(kg: number, system: UnitSystem): string {
  if (system === 'imperial') {
    return `${kgToLbs(kg).toFixed(1)} lbs`;
  }
  return `${kg.toFixed(1)} kg`;
}

export function displayHeight(cm: number, system: UnitSystem): string {
  if (system === 'imperial') {
    const { ft, inches } = cmToFtIn(cm);
    return `${ft}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function weightPlaceholder(system: UnitSystem): string {
  return system === 'imperial' ? '154.3' : '70.0';
}

export function weightUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'lbs' : 'kg';
}

export function heightPlaceholder(system: UnitSystem): string {
  return system === 'imperial' ? '5\'9"' : '175';
}
