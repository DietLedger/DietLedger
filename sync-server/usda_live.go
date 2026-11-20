package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// usdaSearchResponse mirrors the USDA FoodData Central /fdc/v1/search response.
// Only the fields we use are decoded.
type usdaSearchResponse struct {
	TotalHits   int        `json:"totalHits"`
	CurrentPage int        `json:"currentPage"`
	TotalPages  int        `json:"totalPages"`
	Foods       []USDAFood `json:"foods"`
}

// searchUSDALive calls the USDA FoodData Central search API and maps the
// results to FoodItem using the same converter as the bulk seeder.
const usdaResponseBytes int64 = 8 << 20

func searchUSDALive(query, apiKey string, pageSize int) ([]FoodItem, error) {
	return searchUSDALiveContext(context.Background(), query, apiKey, pageSize)
}

func searchUSDALiveContext(ctx context.Context, query, apiKey string, pageSize int) ([]FoodItem, error) {
	client := &http.Client{
		Timeout:       15 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return searchUSDALiveWithClient(ctx, client, query, apiKey, pageSize)
}

func searchUSDALiveWithClient(ctx context.Context, client *http.Client, query, apiKey string, pageSize int) ([]FoodItem, error) {
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

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.nal.usda.gov/fdc/v1/search?"+params.Encode(), nil)
	if err != nil {
		return nil, errors.New("usda request unavailable")
	}
	resp, err := client.Do(req)
	if err != nil {
		// net/http wraps errors in url.Error, whose String includes api_key.
		// Do not wrap or log transport errors, request URLs, or provider bodies.
		return nil, errors.New("usda search unavailable")
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return nil, fmt.Errorf("usda api rate limited")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("usda api returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, usdaResponseBytes+1))
	if err != nil || int64(len(body)) > usdaResponseBytes {
		return nil, errors.New("usda response unavailable or too large")
	}
	var result usdaSearchResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, errors.New("invalid usda response")
	}

	foods := make([]FoodItem, 0, len(result.Foods))
	for _, uf := range result.Foods {
		foods = append(foods, convertUSDAFood(uf, "usda"))
	}
	return foodsWithMeaningfulNutrition(foods), nil
}
