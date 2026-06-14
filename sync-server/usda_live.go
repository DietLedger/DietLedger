package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// usdaSearchResponse mirrors the USDA FoodData Central /fdc/v1/search response.
// Only the fields we use are decoded.
type usdaSearchResponse struct {
	TotalHits  int        `json:"totalHits"`
	CurrentPage int       `json:"currentPage"`
	TotalPages int        `json:"totalPages"`
	Foods      []USDAFood `json:"foods"`
}

// searchUSDALive calls the USDA FoodData Central search API and maps the
// results to FoodItem using the same converter as the bulk seeder.
func searchUSDALive(query, apiKey string, pageSize int) ([]FoodItem, error) {
	if apiKey == "" || apiKey == "DEMO_KEY" {
		return nil, nil
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	params := url.Values{}
	params.Set("api_key", apiKey)
	params.Set("query", query)
	params.Set("pageSize", fmt.Sprintf("%d", pageSize))
	params.Set("pageNumber", "1")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get("https://api.nal.usda.gov/fdc/v1/search?" + params.Encode())
	if err != nil {
		return nil, fmt.Errorf("usda search request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return nil, fmt.Errorf("usda api rate limited")
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("usda api returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result usdaSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode usda response: %w", err)
	}

	foods := make([]FoodItem, 0, len(result.Foods))
	for _, uf := range result.Foods {
		foods = append(foods, convertUSDAFood(uf, "usda"))
	}
	return foods, nil
}
