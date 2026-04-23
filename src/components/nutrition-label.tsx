'use client';

import React from 'react';
import { fmt } from '@/lib/format';

export interface NutritionData {
  servings: number;
  calories: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbs: number;
  dietaryFiber: number;
  totalSugars: number;
  addedSugars: number;
  protein: number;
  vitaminD: number;
  calcium: number;
  iron: number;
  potassium: number;
}

interface NutritionLabelProps {
  data: NutritionData;
  servingDescription?: string;
  servingsPerContainer?: number;
}

const DV_REFERENCE: Record<string, number> = {
  totalFat: 78,
  saturatedFat: 20,
  cholesterol: 300,
  sodium: 2300,
  totalCarbs: 275,
  dietaryFiber: 28,
  addedSugars: 50,
  protein: 50,
  vitaminD: 20,
  calcium: 1300,
  iron: 18,
  potassium: 4700,
};

function calcDV(amount: number, dv: number): number {
  if (dv === 0) return 0;
  return Math.round((amount / dv) * 100);
}

function isAllZero(data: NutritionData): boolean {
  return (
    data.calories === 0 &&
    data.totalFat === 0 &&
    data.saturatedFat === 0 &&
    data.transFat === 0 &&
    data.cholesterol === 0 &&
    data.sodium === 0 &&
    data.totalCarbs === 0 &&
    data.dietaryFiber === 0 &&
    data.totalSugars === 0 &&
    data.addedSugars === 0 &&
    data.protein === 0 &&
    data.vitaminD === 0 &&
    data.calcium === 0 &&
    data.iron === 0 &&
    data.potassium === 0
  );
}

export default function NutritionLabel({ data, servingDescription, servingsPerContainer }: NutritionLabelProps) {
  if (isAllZero(data)) {
    return (
      <div style={styles.container}>
        <p style={styles.emptyMessage}>Add ingredients to see nutrition facts</p>
      </div>
    );
  }

  const servingSizeText = servingDescription || '1 recipe';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>Nutrition Facts</div>

      {/* Thick rule after header */}
      <div style={styles.thickRule} />

      {/* Serving info */}
      <div style={styles.servingInfo}>
        {servingsPerContainer !== undefined && servingsPerContainer > 1 && (
          <div style={styles.servingSizeRow}>
            <span style={{ fontWeight: 700 }}>Servings Per Container:</span>{' '}
            {servingsPerContainer}
          </div>
        )}
        <div style={styles.servingSizeRow}>
          <span style={{ fontWeight: 700 }}>Serving Size:</span>{' '}
          {servingSizeText}
        </div>
      </div>

      {/* Thick rule after serving info */}
      <div style={styles.thickRule} />

      {/* Amount Per Serving */}
      <div style={{ fontWeight: 700, fontSize: 13 }}>Amount Per Serving</div>

      {/* Calories */}
      <div style={styles.caloriesRow}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Calories</span>
        <span style={{ fontWeight: 900, fontSize: 24 }}>{fmt(data.calories)}</span>
      </div>

      {/* Thick rule before %DV header */}
      <div style={styles.thickRule} />

      {/* % Daily Value header */}
      <div style={styles.dvHeaderRow}>
        <span style={{ float: 'right', fontWeight: 700, fontSize: 13 }}>
          % Daily Value*
        </span>
      </div>

      {/* --- Major Nutrient Rows --- */}

      {/* Total Fat */}
      <NutrientRow
        name="Total Fat"
        value={data.totalFat}
        unit="g"
        dv={calcDV(data.totalFat, DV_REFERENCE.totalFat)}
        bold
      />
      <div style={styles.thinRule} />

      {/* Saturated Fat */}
      <NutrientRow
        name="Saturated Fat"
        value={data.saturatedFat}
        unit="g"
        dv={calcDV(data.saturatedFat, DV_REFERENCE.saturatedFat)}
        indent
      />
      <div style={styles.thinRule} />

      {/* Trans Fat */}
      <NutrientRow
        name="Trans Fat"
        value={data.transFat}
        unit="g"
        indent
        noDV
      />
      <div style={styles.thinRule} />

      {/* Cholesterol */}
      <NutrientRow
        name="Cholesterol"
        value={data.cholesterol}
        unit="mg"
        dv={calcDV(data.cholesterol, DV_REFERENCE.cholesterol)}
        bold
      />
      <div style={styles.thinRule} />

      {/* Sodium */}
      <NutrientRow
        name="Sodium"
        value={data.sodium}
        unit="mg"
        dv={calcDV(data.sodium, DV_REFERENCE.sodium)}
        bold
      />
      <div style={styles.thickRule} />

      {/* Total Carbohydrate */}
      <NutrientRow
        name="Total Carbohydrate"
        value={data.totalCarbs}
        unit="g"
        dv={calcDV(data.totalCarbs, DV_REFERENCE.totalCarbs)}
        bold
      />
      <div style={styles.thinRule} />

      {/* Dietary Fiber */}
      <NutrientRow
        name="Dietary Fiber"
        value={data.dietaryFiber}
        unit="g"
        dv={calcDV(data.dietaryFiber, DV_REFERENCE.dietaryFiber)}
        indent
      />
      <div style={styles.thinRule} />

      {/* Total Sugars */}
      <NutrientRow
        name="Total Sugars"
        value={data.totalSugars}
        unit="g"
        indent
        noDV
      />
      <div style={styles.thinRule} />

      {/* Added Sugars */}
      <NutrientRow
        name="Added Sugars"
        value={data.addedSugars}
        unit="g"
        dv={calcDV(data.addedSugars, DV_REFERENCE.addedSugars)}
        indent
      />
      <div style={styles.thickRule} />

      {/* Protein */}
      <NutrientRow
        name="Protein"
        value={data.protein}
        unit="g"
        dv={calcDV(data.protein, DV_REFERENCE.protein)}
        bold
      />

      {/* Thick rule before vitamins */}
      <div style={styles.thickRule} />

      {/* Vitamin D */}
      <NutrientRow
        name="Vitamin D"
        value={data.vitaminD}
        unit="mcg"
        dv={calcDV(data.vitaminD, DV_REFERENCE.vitaminD)}
      />
      <div style={styles.thinRule} />

      {/* Calcium */}
      <NutrientRow
        name="Calcium"
        value={data.calcium}
        unit="mg"
        dv={calcDV(data.calcium, DV_REFERENCE.calcium)}
      />
      <div style={styles.thinRule} />

      {/* Iron */}
      <NutrientRow
        name="Iron"
        value={data.iron}
        unit="mg"
        dv={calcDV(data.iron, DV_REFERENCE.iron)}
      />
      <div style={styles.thinRule} />

      {/* Potassium */}
      <NutrientRow
        name="Potassium"
        value={data.potassium}
        unit="mg"
        dv={calcDV(data.potassium, DV_REFERENCE.potassium)}
      />

      {/* Thick rule before footnote */}
      <div style={styles.thickRule} />

      {/* Footnote */}
      <div style={styles.footnote}>
        * Percent Daily Values are based on a 2,000 calorie diet. Your daily
        values may be higher or lower depending on your calorie needs:
      </div>

      {/* Footnote table */}
      <table style={styles.footnoteTable}>
        <thead>
          <tr>
            <th style={styles.footnoteCell}>&nbsp;</th>
            <th style={{ ...styles.footnoteCell, fontWeight: 700, textAlign: 'center' }}>
              Calories:
            </th>
            <th style={{ ...styles.footnoteCell, fontWeight: 700, textAlign: 'center' }}>
              2,000
            </th>
            <th style={{ ...styles.footnoteCell, fontWeight: 700, textAlign: 'center' }}>
              2,500
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...styles.footnoteCell, fontWeight: 700 }}>Total Fat</td>
            <td style={styles.footnoteCell}>Less than</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>78g</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>98g</td>
          </tr>
          <tr>
            <td style={{ ...styles.footnoteCell, fontWeight: 700 }}>Sat. Fat</td>
            <td style={styles.footnoteCell}>Less than</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>20g</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>25g</td>
          </tr>
          <tr>
            <td style={{ ...styles.footnoteCell, fontWeight: 700 }}>Cholesterol</td>
            <td style={styles.footnoteCell}>Less than</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>300mg</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>300mg</td>
          </tr>
          <tr>
            <td style={{ ...styles.footnoteCell, fontWeight: 700 }}>Sodium</td>
            <td style={styles.footnoteCell}>Less than</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>2,300mg</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>2,300mg</td>
          </tr>
          <tr>
            <td style={{ ...styles.footnoteCell, fontWeight: 700 }}>
              Total Carbohydrate
            </td>
            <td style={styles.footnoteCell}>&nbsp;</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>275g</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>350g</td>
          </tr>
          <tr>
            <td style={{ ...styles.footnoteCell, fontWeight: 700 }}>Dietary Fiber</td>
            <td style={styles.footnoteCell}>&nbsp;</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>28g</td>
            <td style={{ ...styles.footnoteCell, textAlign: 'center' }}>35g</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Sub-component for a single nutrient row ─────────────────────────── */

interface NutrientRowProps {
  name: string;
  value: number;
  unit: string;
  dv?: number;
  bold?: boolean;
  indent?: boolean;
  noDV?: boolean;
}

function NutrientRow({ name, value, unit, dv, bold, indent, noDV }: NutrientRowProps) {
  return (
    <div style={styles.nutrientRow}>
      <span
        style={{
          fontWeight: bold ? 700 : 400,
          fontSize: 13,
          paddingLeft: indent ? 16 : 0,
        }}
      >
        {bold && <span style={{ marginRight: -4 }}>&nbsp;</span>}
        {name}
        {' '}
        <span style={{ fontWeight: bold ? 700 : 400 }}>{fmt(value)}{unit}</span>
      </span>
      {!noDV && dv !== undefined && (
        <span
          style={{
            float: 'right',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {dv}%
        </span>
      )}
    </div>
  );
}

/* ── Inline styles ───────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 280,
    border: '3px solid #000',
    padding: '8px 8px 4px 8px',
    backgroundColor: '#fff',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#000',
    lineHeight: 1.4,
    boxSizing: 'border-box' as const,
  },

  emptyMessage: {
    textAlign: 'center' as const,
    padding: '40px 10px',
    fontSize: 13,
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#000',
  },

  header: {
    fontWeight: 900,
    fontSize: 28,
    lineHeight: 1.1,
    marginBottom: 2,
  },

  thickRule: {
    height: 4,
    backgroundColor: '#000',
    margin: '2px 0',
  },

  thinRule: {
    height: 1,
    backgroundColor: '#000',
    margin: '2px 0',
  },

  servingInfo: {
    fontSize: 13,
    lineHeight: 1.5,
  },

  servingSizeRow: {
    fontSize: 13,
  },

  caloriesRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
    marginBottom: 2,
  },

  dvHeaderRow: {
    overflow: 'hidden' as const,
    fontSize: 13,
    marginBottom: 0,
  },

  nutrientRow: {
    overflow: 'hidden' as const,
    paddingTop: 2,
    paddingBottom: 2,
  },

  footnote: {
    fontSize: 8,
    lineHeight: 1.4,
    marginBottom: 4,
  },

  footnoteTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 8,
    lineHeight: 1.3,
  },

  footnoteCell: {
    padding: '0 2px',
    verticalAlign: 'top' as const,
    fontSize: 8,
  },
};
