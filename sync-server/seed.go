package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type USDAFood struct {
	FdcID           int                    `json:"fdcId"`
	Description     string                 `json:"description"`
	DataType        string                 `json:"dataType"`
	BrandOwner      string                 `json:"brandOwner,omitempty"`
	GtinUpc         string                 `json:"gtinUpc,omitempty"`
	ServingSize     float64                `json:"servingSize"`
	ServingSizeUnit string                 `json:"servingSizeUnit"`
	FoodNutrients   []USDANutrient         `json:"foodNutrients"`
	NutrientMapping map[string]float64     `json:"-"`
}

type USDANutrient struct {
	Nutrient struct {
		Number string `json:"number"`
		Name   string `json:"name"`
		Unit   string `json:"unitName"`
	} `json:"nutrient"`
	Number string  `json:"number"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Unit   string  `json:"unitName"`
}

func (n USDANutrient) GetNumber() string {
	if n.Nutrient.Number != "" {
		return n.Nutrient.Number
	}
	return n.Number
}

var nutrientMap = map[string]string{
	"208": "calories",
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
	"324": "vitaminD",
	"301": "calcium",
	"303": "iron",
	"306": "potassium",
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
		result = append(result, fi)
	}

	return result, nil
}

func convertUSDAFood(uf USDAFood, source string) FoodItem {
	nutrients := make(map[string]float64)
	for _, n := range uf.FoodNutrients {
		if field, ok := nutrientMap[n.GetNumber()]; ok {
			nutrients[field] = n.Amount
		}
	}

	brandOwner := uf.BrandOwner
	gtinUpc := uf.GtinUpc

	return FoodItem{
		FdcID:          uf.FdcID,
		Description:    uf.Description,
		DataType:       uf.DataType,
		BrandOwner:     &brandOwner,
		GtinUpc:        &gtinUpc,
		ServingSize:    uf.ServingSize,
		ServingSizeUnit: uf.ServingSizeUnit,
		Calories:       nutrients["calories"],
		TotalFat:       nutrients["totalFat"],
		SaturatedFat:   nutrients["saturatedFat"],
		TransFat:       nutrients["transFat"],
		Cholesterol:    nutrients["cholesterol"],
		Sodium:         nutrients["sodium"],
		TotalCarbs:     nutrients["totalCarbs"],
		DietaryFiber:   nutrients["dietaryFiber"],
		TotalSugars:    nutrients["totalSugars"],
		AddedSugars:    nutrients["addedSugars"],
		Protein:        nutrients["protein"],
		VitaminD:       nutrients["vitaminD"],
		Calcium:        nutrients["calcium"],
		Iron:           nutrients["iron"],
		Potassium:      nutrients["potassium"],
		Source:         source,
	}
}
