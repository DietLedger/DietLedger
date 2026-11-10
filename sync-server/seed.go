package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strings"
	"time"
)

type USDAFood struct {
	FdcID           int                `json:"fdcId"`
	Description     string             `json:"description"`
	DataType        string             `json:"dataType"`
	BrandOwner      string             `json:"brandOwner,omitempty"`
	GtinUpc         string             `json:"gtinUpc,omitempty"`
	ServingSize     float64            `json:"servingSize"`
	ServingSizeUnit string             `json:"servingSizeUnit"`
	FoodNutrients   []USDANutrient     `json:"foodNutrients"`
	FoodPortions    []USDAFoodPortion  `json:"foodPortions"`
	NutrientMapping map[string]float64 `json:"-"`
}

type USDAFoodPortion struct {
	Amount             float64         `json:"amount"`
	MeasureUnit        json.RawMessage `json:"measureUnit"`
	Modifier           string          `json:"modifier"`
	PortionDescription string          `json:"portionDescription"`
	GramWeight         float64         `json:"gramWeight"`
}

type USDANutrient struct {
	Nutrient struct {
		ID     int    `json:"id"`
		Number string `json:"number"`
		Name   string `json:"name"`
		Unit   string `json:"unitName"`
	} `json:"nutrient"`
	NutrientID     int      `json:"nutrientId"`
	NutrientNumber string   `json:"nutrientNumber"`
	Number         string   `json:"number"`
	Name           string   `json:"name"`
	Amount         float64  `json:"amount"`
	Value          *float64 `json:"value"`
	Unit           string   `json:"unitName"`
}

func (n USDANutrient) GetNumber() string {
	if n.Nutrient.Number != "" {
		return n.Nutrient.Number
	}
	if n.NutrientNumber != "" {
		return n.NutrientNumber
	}
	return n.Number
}

func (n USDANutrient) GetAmount() float64 {
	if n.Value != nil {
		return *n.Value
	}
	return n.Amount
}

func (n USDANutrient) GetID() int {
	if n.Nutrient.ID != 0 {
		return n.Nutrient.ID
	}
	return n.NutrientID
}

func (n USDANutrient) GetUnit() string {
	if n.Nutrient.Unit != "" {
		return n.Nutrient.Unit
	}
	return n.Unit
}

var nutrientMap = map[string]string{
	"204": "totalFat",
	"606": "saturatedFat",
	"605": "transFat",
	"601": "cholesterol",
	"307": "sodium",
	"205": "totalCarbs",
	"291": "dietaryFiber",
	"269": "totalSugars",
	"539": "addedSugars",
	"203": "protein",
	"301": "calcium",
	"303": "iron",
	"306": "potassium",
}

// Vitamin D is deliberately absent from nutrientMap: its USDA nutrient
// numbers differ by dataset AND by unit, so it needs dedicated resolution
// (see resolveVitaminD). All other nutrients map 1:1 in their native unit.
const (
	vitaminDMicrogramsNumber = "1166" // Foundation: "Vitamin D (D2 + D3), micrograms"
	iuPerMicrogram           = 40.0   // 1 microgram vitamin D = 40 IU
)

var vitaminDIUNumbers = map[string]bool{
	"324":  true, // SR Legacy: "Vitamin D, IU"
	"1114": true, // Survey/Branded: "Vitamin D (D2 + D3), IU"
}

// resolveVitaminD returns micrograms. A native-microgram value wins over an
// IU-derived one; IU values convert at 40 IU per microgram. The stored
// FoodItem.VitaminD field is micrograms everywhere downstream (labels use a
// 20 mcg Daily Value reference; profile goals are micrograms).
func resolveVitaminD(foodNutrients []USDANutrient) float64 {
	mcg, iu := 0.0, 0.0
	for _, n := range foodNutrients {
		switch n.GetNumber() {
		case vitaminDMicrogramsNumber:
			if n.GetAmount() > mcg {
				mcg = n.GetAmount()
			}
		default:
			if vitaminDIUNumbers[n.GetNumber()] && n.GetAmount() > iu {
				iu = n.GetAmount()
			}
		}
	}
	if mcg > 0 {
		return mcg
	}
	return iu / iuPerMicrogram
}

// Foundation reports energy as Atwater specific (2048/958) or general
// (2047/957), whereas older datasets use Energy (1008/208). Prefer the
// food-specific kcal result, but do not manufacture energy from macros when
// USDA provides none. USDA search results identify these by nutrientId and
// nutrientNumber; bulk JSON nests id and number under nutrient.
func resolveCalories(foodNutrients []USDANutrient) float64 {
	var specific, general, legacy float64
	for _, n := range foodNutrients {
		unit := n.GetUnit()
		if unit != "" && !strings.EqualFold(unit, "kcal") {
			continue
		}
		value := n.GetAmount()
		switch {
		case n.GetID() == 2048 || n.GetNumber() == "958":
			if value > specific {
				specific = value
			}
		case n.GetID() == 2047 || n.GetNumber() == "957":
			if value > general {
				general = value
			}
		case n.GetID() == 1008 || n.GetNumber() == "208":
			if value > legacy {
				legacy = value
			}
		}
	}
	if specific > 0 {
		return specific
	}
	if general > 0 {
		return general
	}
	return legacy
}

var datasetURLs = map[string]string{
	"foundation": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip",
	"sr_legacy":  "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip",
	"fndds":      "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip",
	"branded":    "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2026-04-30.zip",
}

var datasetTopLevelKeys = map[string]string{
	"foundation": "FoundationFoods",
	"sr_legacy":  "SRLegacyFoods",
	"fndds":      "SurveyFoods",
	"branded":    "BrandedFoods",
}

func (s *Server) startSeedProcessor() {
	go func() {
		for {
			time.Sleep(5 * time.Second)
			s.processPendingJobs()
		}
	}()
}

func (s *Server) processPendingJobs() {
	jobs, err := s.store.ListSeedJobs()
	if err != nil {
		return
	}
	for _, job := range jobs {
		if job.Status == "pending" {
			go s.processSeedJob(job.ID, job.DataType)
			return
		}
	}
}

func (s *Server) processSeedJob(jobID int, dataType string) {
	url, ok := datasetURLs[dataType]
	if !ok {
		log.Printf("[Seed] Job %d: unknown dataset %q", jobID, dataType)
		s.store.UpdateSeedJob(jobID, "failed", 0, 0, "")
		return
	}

	log.Printf("[Seed] Starting job %d: %s", jobID, dataType)

	_ = s.store.UpdateSeedJob(jobID, "downloading", 0, 5, "")

	resp, err := http.Get(url)
	if err != nil {
		log.Printf("[Seed] Job %d: download failed: %v", jobID, err)
		_ = s.store.UpdateSeedJob(jobID, "failed", 0, 0, "")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("[Seed] Job %d: download HTTP %d", jobID, resp.StatusCode)
		_ = s.store.UpdateSeedJob(jobID, "failed", 0, 0, "")
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[Seed] Job %d: read body failed: %v", jobID, err)
		_ = s.store.UpdateSeedJob(jobID, "failed", 0, 0, "")
		return
	}

	_ = s.store.UpdateSeedJob(jobID, "extracting", 0, 20, "")

	var foods []FoodItem

	contentType := resp.Header.Get("Content-Type")
	if strings.Contains(contentType, "zip") || strings.HasSuffix(url, ".zip") {
		foods, err = parseZipBody(body, dataType)
	} else {
		foods, err = parseFoodJSON(body, dataType)
	}
	if err != nil {
		log.Printf("[Seed] Job %d: parse failed: %v", jobID, err)
		_ = s.store.UpdateSeedJob(jobID, "failed", 0, 0, "")
		return
	}

	total := len(foods)
	if total == 0 {
		_ = s.store.UpdateSeedJob(jobID, "completed", 0, 100, "")
		return
	}

	log.Printf("[Seed] Job %d: parsed %d foods, importing...", jobID, total)

	batchSize := 500
	imported := 0
	for i := 0; i < total; i += batchSize {
		end := i + batchSize
		if end > total {
			end = total
		}
		batch := foods[i:end]

		count, err := s.store.CreateFoodItems(batch)
		if err != nil {
			log.Printf("[Seed] Job %d: import failed at %d: %v", jobID, imported, err)
			_ = s.store.UpdateSeedJob(jobID, "failed", imported, 0, "")
			return
		}
		imported += count

		progress := 20 + float64(imported)/float64(total)*80
		_ = s.store.UpdateSeedJob(jobID, "importing", imported, progress, "")

		if end%5000 == 0 || end == total {
			log.Printf("[Seed] Job %d: imported %d/%d foods", jobID, imported, total)
		}
	}

	_ = s.store.UpdateSeedJob(jobID, "completed", imported, 100, "")
	log.Printf("[Seed] Job %d: completed, %d foods imported", jobID, imported)
}

func parseZipBody(data []byte, dataType string) ([]FoodItem, error) {
	reader := strings.NewReader(string(data))
	zipReader, err := zip.NewReader(reader, int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("open zip: %w", err)
	}

	for _, f := range zipReader.File {
		if strings.HasSuffix(f.Name, ".json") {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("open %s: %w", f.Name, err)
			}
			defer rc.Close()
			body, err := io.ReadAll(rc)
			if err != nil {
				return nil, fmt.Errorf("read %s: %w", f.Name, err)
			}
			return parseFoodJSON(body, dataType)
		}
	}

	return nil, fmt.Errorf("no JSON file found in zip archive")
}

func hasMeaningfulFoodNutrition(food FoodItem) bool {
	return food.Calories > 0 || food.TotalFat > 0 || food.SaturatedFat > 0 || food.TransFat > 0 ||
		food.Cholesterol > 0 || food.Sodium > 0 || food.TotalCarbs > 0 || food.DietaryFiber > 0 ||
		food.TotalSugars > 0 || food.AddedSugars > 0 || food.Protein > 0 || food.VitaminD > 0 ||
		food.Calcium > 0 || food.Iron > 0 || food.Potassium > 0
}

func foodsWithMeaningfulNutrition(foods []FoodItem) []FoodItem {
	eligible := make([]FoodItem, 0, len(foods))
	for _, food := range foods {
		if hasMeaningfulFoodNutrition(food) {
			eligible = append(eligible, food)
		}
	}
	return eligible
}

func parseFoodJSON(data []byte, dataType string) ([]FoodItem, error) {
	topKey := datasetTopLevelKeys[dataType]
	if topKey == "" {
		topKey = "FoundationFoods"
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal top level: %w", err)
	}

	foodsJSON, ok := raw[topKey]
	if !ok {
		for k, v := range raw {
			if strings.Contains(strings.ToLower(k), "food") {
				foodsJSON = v
				ok = true
				break
			}
		}
		if !ok {
			return nil, fmt.Errorf("key %q not found in JSON", topKey)
		}
	}

	var usdaFoods []USDAFood
	if err := json.Unmarshal(foodsJSON, &usdaFoods); err != nil {
		return nil, fmt.Errorf("unmarshal foods array: %w", err)
	}

	var result []FoodItem
	for _, uf := range usdaFoods {
		fi := convertUSDAFood(uf, dataType)
		if hasMeaningfulFoodNutrition(fi) {
			result = append(result, fi)
		}
	}

	return result, nil
}

func convertUSDAFood(uf USDAFood, source string) FoodItem {
	nutrients := make(map[string]float64)
	for _, n := range uf.FoodNutrients {
		if field, ok := nutrientMap[n.GetNumber()]; ok {
			// Foundation analytical differences can be slightly negative (e.g.
			// FDC 2727569 carbohydrate by difference). Canonical nutrients and
			// ingredient validation require non-negative quantities.
			value := n.GetAmount()
			if value < 0 {
				value = 0
			}
			nutrients[field] = value
		}
	}

	brandOwner := uf.BrandOwner
	gtinUpc := uf.GtinUpc
	portions := make([]FoodPortion, 0, len(uf.FoodPortions))
	for _, p := range uf.FoodPortions {
		if p.Amount <= 0 || math.IsNaN(p.Amount) || math.IsInf(p.Amount, 0) ||
			p.GramWeight <= 0 || math.IsNaN(p.GramWeight) || math.IsInf(p.GramWeight, 0) {
			continue
		}
		var unit string
		if len(p.MeasureUnit) > 0 {
			// Bulk Foundation/SR Legacy uses {"name":"cup"}; accept a plain
			// string too, but never infer a unit from an absent/unknown shape.
			if p.MeasureUnit[0] == '"' {
				_ = json.Unmarshal(p.MeasureUnit, &unit)
			} else {
				var measure struct {
					Name string `json:"name"`
				}
				if json.Unmarshal(p.MeasureUnit, &measure) == nil {
					unit = measure.Name
				}
			}
		}
		portions = append(portions, FoodPortion{
			Amount: p.Amount, MeasureUnit: unit, Modifier: p.Modifier,
			PortionDescription: p.PortionDescription, GramWeight: p.GramWeight,
		})
	}

	return FoodItem{
		FdcID:           uf.FdcID,
		Description:     uf.Description,
		DataType:        uf.DataType,
		BrandOwner:      &brandOwner,
		GtinUpc:         &gtinUpc,
		ServingSize:     uf.ServingSize,
		ServingSizeUnit: uf.ServingSizeUnit,
		Portions:        portions,
		Calories:        resolveCalories(uf.FoodNutrients),
		TotalFat:        nutrients["totalFat"],
		SaturatedFat:    nutrients["saturatedFat"],
		TransFat:        nutrients["transFat"],
		Cholesterol:     nutrients["cholesterol"],
		Sodium:          nutrients["sodium"],
		TotalCarbs:      nutrients["totalCarbs"],
		DietaryFiber:    nutrients["dietaryFiber"],
		TotalSugars:     nutrients["totalSugars"],
		AddedSugars:     nutrients["addedSugars"],
		Protein:         nutrients["protein"],
		VitaminD:        resolveVitaminD(uf.FoodNutrients),
		Calcium:         nutrients["calcium"],
		Iron:            nutrients["iron"],
		Potassium:       nutrients["potassium"],
		Source:          source,
	}
}
