package main

// Package FDC facts are retained input, not a trusted ingestion channel. The
// ordinary staging path is also used by the low-level restore entry point when
// an offline package requires standard-food records absent from this instance.
func bundleNeedsFoodQuarantine(reader postgresReader, bundle RecipeBundle) (bool, error) {
	for _, f := range bundle.FoodItems {
		var exists bool
		if err := reader.QueryRow(`SELECT EXISTS(SELECT 1 FROM food_items WHERE fdc_id=$1)`, f.FdcID).Scan(&exists); err != nil {
			return false, err
		}
		if !exists {
			return true, nil
		}
	}
	return false, nil
}
