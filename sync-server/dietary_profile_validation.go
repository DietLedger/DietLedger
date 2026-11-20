package main

import (
	"encoding/json"
	"fmt"
)

var dietaryProfileTags = map[string]bool{
	"vegetarian": true, "vegan": true, "glutenFree": true, "dairyFree": true,
	"nutFree": true, "soyFree": true, "eggFree": true, "keto": true,
	"paleo": true, "lowFodmap": true, "dASH": true, "mediterranean": true,
	"diabetesAware": true,
}

var dietaryProfileAllergens = map[string]bool{
	"milk": true, "eggs": true, "fish": true, "shellfish": true,
	"treeNuts": true, "peanuts": true, "wheat": true, "soybeans": true, "sesame": true,
}

func validateDietaryProfileEnumArray(raw string, allowed map[string]bool) error {
	var values []string
	// Unmarshal rejects trailing values and non-array shapes. A null array
	// must be rejected separately; it is not a list of configured restrictions.
	if err := json.Unmarshal([]byte(raw), &values); err != nil || values == nil {
		return fmt.Errorf("expected an array of known values")
	}
	for _, value := range values {
		if !allowed[value] {
			return fmt.Errorf("unknown value %q", value)
		}
	}
	return nil
}
