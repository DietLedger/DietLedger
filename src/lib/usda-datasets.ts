export interface USDADataset {
  name: string;
  url: string;
  releaseDate: string;
  format: 'json' | 'csv';
  estimatedSize: string;
  description: string;
}

export const USDA_DATASETS: Record<string, USDADataset> = {
  foundation: {
    name: 'Foundation Foods',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-12-18.zip',
    releaseDate: '2025-12-18',
    format: 'json',
    estimatedSize: '467K zipped / 6.5M',
    description: 'Analytically derived data on ~400 commodity foods',
  },
  srLegacy: {
    name: 'SR Legacy',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
    releaseDate: '2018-04',
    format: 'json',
    estimatedSize: '12.3M zipped / 205M',
    description: 'Historic Standard Reference data (~7,800 foods)',
  },
  fndds: {
    name: 'FNDDS',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    releaseDate: '2024-10-31',
    format: 'json',
    estimatedSize: '3.7M zipped / 64M',
    description: 'Survey foods for dietary studies (~8,600 foods)',
  },
  branded: {
    name: 'Branded Foods',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2025-12-18.zip',
    releaseDate: '2025-12-18',
    format: 'json',
    estimatedSize: '195M zipped / 3.1G',
    description: 'Branded food products (~1.8M products with UPCs)',
  },
  full: {
    name: 'Full Download (All Data Types)',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2025-12-18.zip',
    releaseDate: '2025-12-18',
    format: 'csv',
    estimatedSize: '458M zipped / 3.1G',
    description: 'All data types combined (CSV format only)',
  },
};

export type DatasetKey = keyof typeof USDA_DATASETS;
