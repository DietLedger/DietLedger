export function DiabetesGuidance({ compact = false }: { compact?: boolean }) {
  const guidance = (
    <>
      <p>Individualize total carbohydrate with your care team; there is no universal per-meal amount. Discuss carbohydrate changes with your care team, especially when taking medication. Daily sodium guidance is below 2,300 mg, not a per-recipe limit.</p>
      <p>Choose minimally processed whole foods, nonstarchy vegetables, whole fruit, legumes, whole grains, lean proteins and unsaturated fats. Minimize sugary drinks, added sugar and foods high in saturated fat. Consider the plate method: half nonstarchy vegetables, one quarter lean protein and one quarter high-fiber carbohydrate.</p>
      <p><a className="underline" href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12690188/" target="_blank" rel="noreferrer">ADA 2026 Standards</a>{' · '}<a className="underline" href="https://diabetes.org/food-nutrition/understanding-carbs/carb-counting-and-diabetes" target="_blank" rel="noreferrer">ADA carb counting</a>{' · '}<a className="underline" href="https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes" target="_blank" rel="noreferrer">NIDDK healthy living</a></p>
    </>
  );
  return (
    <div className="space-y-2 text-xs text-muted-foreground break-words">
      <p>{compact
        ? 'Optional high-fiber starter (14 g/1,000 kcal), not ADA recipe certification. Suitable meal components may not match.'
        : 'This optional high-fiber screen uses 14 g fiber per 1,000 kcal as a starting point. It is not ADA recipe certification or a complete dietary assessment. A single meal component, such as lean protein, may not pass even when it fits an overall eating plan.'}</p>
      {compact ? <details className="space-y-2"><summary className="cursor-pointer underline">Guidance and sources</summary>{guidance}</details> : guidance}
    </div>
  );
}
