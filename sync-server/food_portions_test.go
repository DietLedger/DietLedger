package main

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestUSDAFoodPortions(t *testing.T) {
	for _, tc := range []struct {
		name, dataType, payload string
		want                    []FoodPortion
	}{
		{
			name: "Foundation nested portion and missing optional text", dataType: "foundation",
			payload: `{"FoundationFoods":[{"fdcId":123,"foodNutrients":[{"nutrient":{"id":2048,"number":"958","unitName":"kcal"},"amount":10}],"foodPortions":[{"amount":1,"measureUnit":{"name":"cup"},"modifier":"sliced","portionDescription":"1 cup, sliced","gramWeight":125},{"amount":2,"measureUnit":{"name":"tbsp"},"gramWeight":14.2}]}]}`,
			want:    []FoodPortion{{Amount: 1, MeasureUnit: "cup", Modifier: "sliced", PortionDescription: "1 cup, sliced", GramWeight: 125}, {Amount: 2, MeasureUnit: "tbsp", GramWeight: 14.2}},
		},
		{
			name: "SR Legacy portions and invalid weights", dataType: "sr_legacy",
			payload: `{"SRLegacyFoods":[{"fdcId":456,"foodNutrients":[{"nutrient":{"id":1008,"number":"208","unitName":"kcal"},"amount":10}],"foodPortions":[{"amount":1,"measureUnit":{"name":"each"},"modifier":"large","gramWeight":50},{"amount":1,"measureUnit":{"name":"cup"},"gramWeight":0},{"amount":1,"gramWeight":-4},{"amount":0,"gramWeight":20}]}]}`,
			want:    []FoodPortion{{Amount: 1, MeasureUnit: "each", Modifier: "large", PortionDescription: "", GramWeight: 50}},
		},
		{
			name: "live USDA portion with string measure", dataType: "foundation",
			payload: `{"FoundationFoods":[{"fdcId":124,"foodNutrients":[{"nutrientId":2048,"nutrientNumber":"958","unitName":"kcal","value":10}],"foodPortions":[{"amount":1,"measureUnit":"cup","gramWeight":120}]}]}`,
			want:    []FoodPortion{{Amount: 1, MeasureUnit: "cup", GramWeight: 120}},
		},
		{
			name: "no portions", dataType: "foundation",
			payload: `{"FoundationFoods":[{"fdcId":789,"foodNutrients":[{"nutrient":{"id":2048,"number":"958","unitName":"kcal"},"amount":10}]}]}`,
			want:    []FoodPortion{},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			foods, err := parseFoodJSON([]byte(tc.payload), tc.dataType)
			if err != nil {
				t.Fatal(err)
			}
			if len(foods) != 1 || !reflect.DeepEqual(foods[0].Portions, tc.want) {
				t.Fatalf("portions = %+v, want %+v", foods, tc.want)
			}
			encoded, err := json.Marshal(foods[0])
			if err != nil {
				t.Fatal(err)
			}
			var response struct {
				Portions []FoodPortion `json:"portions"`
			}
			if err := json.Unmarshal(encoded, &response); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(response.Portions, tc.want) {
				t.Fatalf("API portions = %+v, want %+v", response.Portions, tc.want)
			}
		})
	}
}

func TestFoodPortionPersistenceAndSparseUpsert(t *testing.T) {
	s := testStore(t)
	upc := "1234567890"
	rich := []FoodPortion{{Amount: 1, MeasureUnit: "cup", Modifier: "chopped", PortionDescription: "1 cup", GramWeight: 85}}
	item := FoodItem{FdcID: 900001, Description: "Portion food", DataType: "Foundation", GtinUpc: &upc, Source: "foundation", Portions: rich}
	created, err := s.CreateFoodItem(&item)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(created.Portions, rich) {
		t.Fatalf("created portions = %+v", created.Portions)
	}
	byID, err := s.GetFoodByFdcID(item.FdcID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(byID.Portions, rich) {
		t.Fatalf("fdc portions = %+v", byID.Portions)
	}
	byUPC, err := s.GetFoodByGtinUpc(upc)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(byUPC.Portions, rich) {
		t.Fatalf("upc portions = %+v", byUPC.Portions)
	}
	found, _, err := s.SearchFoods("Portion food", 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || !reflect.DeepEqual(found[0].Portions, rich) {
		t.Fatalf("search portions = %+v", found)
	}
	found, _, err = s.SearchFoods("", 1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || !reflect.DeepEqual(found[0].Portions, rich) {
		t.Fatalf("list portions = %+v", found)
	}

	// USDA search results are sparse: neither an empty nor a partial live payload
	// may discard richer portions from a bulk import. New live portions are useful,
	// but an existing matching portion remains authoritative.
	if _, err := s.CreateFoodItems([]FoodItem{{FdcID: item.FdcID, Description: "Portion food", DataType: "Foundation", GtinUpc: &upc, Source: "usda"}}); err != nil {
		t.Fatal(err)
	}
	stored, err := s.GetFoodByFdcID(item.FdcID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stored.Portions, rich) {
		t.Fatalf("empty sparse upsert erased portions: %+v", stored.Portions)
	}

	partial := []FoodPortion{
		{Amount: 1, MeasureUnit: "cup", Modifier: "chopped", PortionDescription: "1 cup", GramWeight: 90},
		{Amount: 1, MeasureUnit: "tbsp", PortionDescription: "1 tbsp", GramWeight: 8},
	}
	wantMerged := append(append([]FoodPortion{}, rich...), partial[1])
	if _, err := s.CreateFoodItems([]FoodItem{{FdcID: item.FdcID, Description: "Portion food", DataType: "Foundation", GtinUpc: &upc, Source: "usda", Portions: partial}}); err != nil {
		t.Fatal(err)
	}
	stored, err = s.GetFoodByFdcID(item.FdcID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stored.Portions, wantMerged) {
		t.Fatalf("partial sparse upsert portions = %+v, want merged %+v", stored.Portions, wantMerged)
	}
	if _, err := s.CreateFoodItems([]FoodItem{{FdcID: item.FdcID, Description: "Portion food", Source: "usda", Portions: partial}}); err != nil {
		t.Fatal(err)
	}
	stored, err = s.GetFoodByFdcID(item.FdcID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stored.Portions, wantMerged) {
		t.Fatalf("repeated live upsert duplicated portions: %+v", stored.Portions)
	}

	updated := []FoodPortion{{Amount: 1, MeasureUnit: "tbsp", GramWeight: 8}}
	if _, err := s.CreateFoodItems([]FoodItem{{FdcID: item.FdcID, Description: "Portion food", DataType: "Foundation", Source: "foundation", Portions: updated}, {FdcID: 900002, Description: "New food", DataType: "Foundation", Source: "foundation", Portions: rich}}); err != nil {
		t.Fatal(err)
	}
	stored, err = s.GetFoodByFdcID(item.FdcID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stored.Portions, updated) {
		t.Fatalf("rich upsert portions = %+v, want %+v", stored.Portions, updated)
	}
	stored, err = s.GetFoodByFdcID(900002)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stored.Portions, rich) {
		t.Fatalf("batch insert portions = %+v", stored.Portions)
	}
	if _, err := s.CreateFoodItems([]FoodItem{{FdcID: 900003, Description: "Unportioned food", Source: "usda"}}); err != nil {
		t.Fatal(err)
	}
	stored, err = s.GetFoodByFdcID(900003)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Portions == nil || len(stored.Portions) != 0 {
		t.Fatalf("missing USDA portions must return []: %+v", stored.Portions)
	}
}
