package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	RecipeBundleFormat  = "dietledger.recipe-bundle"
	RecipeBundleVersion = 1
)

var ErrExportForbidden = errors.New("export forbidden")

type RecipeBundle struct {
	Format            string                 `json:"format"`
	Version           int                    `json:"version"`
	ExportedAt        string                 `json:"exportedAt"`
	Source            RecipeBundleSource     `json:"source"`
	Recipes           []BundleRecipe         `json:"recipes"`
	Books             []BundleBook           `json:"books"`
	Chapters          []BundleChapter        `json:"chapters"`
	ChapterRecipes    []BundleChapterRecipe  `json:"chapterRecipes"`
	ChapterPages      []BundleChapterPage    `json:"chapterPages"`
	BookPages         []BundleBookPage       `json:"bookPages"`
	Categories        []BundleCategory       `json:"categories"`
	RecipeCategories  []BundleRecipeCategory `json:"recipeCategories"`
	Templates         []BundleTemplate       `json:"templates"`
	FoodItems         []BundleFoodItem       `json:"foodItems"`
	CustomFoods       []BundleCustomFood     `json:"customFoods"`
	NutritionProfiles []PersonProfile        `json:"nutritionProfiles,omitempty"`
	FoodLogEntries    []FoodLogEntry         `json:"foodLogEntries,omitempty"`
	WeightEntries     []WeightEntry          `json:"weightEntries,omitempty"`
	MealPlans         []MealPlan             `json:"mealPlans,omitempty"`
	DayPlanEntries    []DayPlanEntry         `json:"dayPlanEntries,omitempty"`
	MealGroups        []MealGroup            `json:"mealGroups,omitempty"`
}

type RecipeBundleSource struct {
	App     string `json:"app"`
	Version string `json:"version"`
}

type BundleNutrients struct {
	Calories     float64 `json:"calories"`
	TotalFat     float64 `json:"totalFat"`
	SaturatedFat float64 `json:"saturatedFat"`
	TransFat     float64 `json:"transFat"`
	Cholesterol  float64 `json:"cholesterol"`
	Sodium       float64 `json:"sodium"`
	TotalCarbs   float64 `json:"totalCarbs"`
	DietaryFiber float64 `json:"dietaryFiber"`
	TotalSugars  float64 `json:"totalSugars"`
	AddedSugars  float64 `json:"addedSugars"`
	Protein      float64 `json:"protein"`
	VitaminD     float64 `json:"vitaminD"`
	Calcium      float64 `json:"calcium"`
	Iron         float64 `json:"iron"`
	Potassium    float64 `json:"potassium"`
}

type BundleIngredientSourceRef struct {
	Type               string `json:"type"`
	FdcID              int    `json:"fdcId,omitempty"`
	BundleCustomFoodID string `json:"bundleCustomFoodId,omitempty"`
	BundleRecipeID     string `json:"bundleRecipeId,omitempty"`
}

type BundleIngredientGroup struct {
	BundleGroupID string `json:"bundleGroupId"`
	Title         string `json:"title"`
}

type BundleIngredient struct {
	BundleIngredientID string                    `json:"bundleIngredientId"`
	SourceIngredientID string                    `json:"sourceIngredientId,omitempty"`
	Name               string                    `json:"name"`
	Amount             float64                   `json:"amount"`
	Unit               string                    `json:"unit"`
	Description        string                    `json:"description,omitempty"`
	BundleGroupID      *string                   `json:"bundleGroupId,omitempty"`
	PrepInstructions   []string                  `json:"prepInstructions,omitempty"`
	StorageLocation    string                    `json:"storageLocation,omitempty"`
	Source             BundleIngredientSourceRef `json:"source"`
	Nutrients          BundleNutrients           `json:"nutrients"`
}

type BundleRecipe struct {
	BundleRecipeID   string                  `json:"bundleRecipeId"`
	SourceRecipeID   string                  `json:"sourceRecipeId,omitempty"`
	Name             string                  `json:"name"`
	Servings         int                     `json:"servings"`
	ServingName      string                  `json:"servingName"`
	PrepTime         *string                 `json:"prepTime,omitempty"`
	CookTime         *string                 `json:"cookTime,omitempty"`
	Instructions     *string                 `json:"instructions,omitempty"`
	LeftoverStorage  *string                 `json:"leftoverStorage,omitempty"`
	IngredientGroups []BundleIngredientGroup `json:"ingredientGroups"`
	Ingredients      []BundleIngredient      `json:"ingredients"`
}

type BundleFoodItem struct {
	SourceFoodItemID string          `json:"sourceFoodItemId,omitempty"`
	FdcID            int             `json:"fdcId"`
	Description      string          `json:"description"`
	DataType         string          `json:"dataType"`
	BrandOwner       *string         `json:"brandOwner,omitempty"`
	GtinUpc          *string         `json:"gtinUpc,omitempty"`
	ServingSize      float64         `json:"servingSize"`
	ServingSizeUnit  string          `json:"servingSizeUnit"`
	Source           string          `json:"source"`
	Nutrients        BundleNutrients `json:"nutrients"`
}

type BundleCustomFood struct {
	BundleCustomFoodID string          `json:"bundleCustomFoodId"`
	SourceCustomFoodID string          `json:"sourceCustomFoodId,omitempty"`
	Name               string          `json:"name"`
	Nutrients          BundleNutrients `json:"nutrients"`
}

type BundleBook struct {
	BundleBookID string `json:"bundleBookId"`
	SourceBookID string `json:"sourceBookId,omitempty"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	CoverColor   string `json:"coverColor"`
}

type BundleChapter struct {
	BundleChapterID        string  `json:"bundleChapterId"`
	SourceChapterID        string  `json:"sourceChapterId,omitempty"`
	BundleBookID           string  `json:"bundleBookId"`
	Title                  string  `json:"title"`
	Position               int     `json:"position"`
	BundlePageTemplateID   *string `json:"bundlePageTemplateId,omitempty"`
	BundleRecipeTemplateID *string `json:"bundleRecipeTemplateId,omitempty"`
}

type BundleChapterRecipe struct {
	BundleChapterID string `json:"bundleChapterId"`
	BundleRecipeID  string `json:"bundleRecipeId"`
	Position        int    `json:"position"`
}

type BundleChapterPage struct {
	BundleChapterPageID string `json:"bundleChapterPageId"`
	SourceChapterPageID string `json:"sourceChapterPageId,omitempty"`
	BundleChapterID     string `json:"bundleChapterId"`
	Title               string `json:"title"`
	Content             string `json:"content"`
	Position            int    `json:"position"`
}

type BundleBookPage struct {
	BundleBookPageID string `json:"bundleBookPageId"`
	SourceBookPageID string `json:"sourceBookPageId,omitempty"`
	BundleBookID     string `json:"bundleBookId"`
	Title            string `json:"title"`
	Content          string `json:"content"`
	Position         int    `json:"position"`
}

type BundleCategory struct {
	BundleCategoryID       string  `json:"bundleCategoryId"`
	SourceCategoryID       string  `json:"sourceCategoryId,omitempty"`
	Name                   string  `json:"name"`
	ParentBundleCategoryID *string `json:"parentBundleCategoryId,omitempty"`
}

type BundleRecipeCategory struct {
	BundleRecipeID   string `json:"bundleRecipeId"`
	BundleCategoryID string `json:"bundleCategoryId"`
}

type BundleTemplate struct {
	BundleTemplateID string          `json:"bundleTemplateId"`
	SourceTemplateID string          `json:"sourceTemplateId,omitempty"`
	Name             string          `json:"name"`
	Type             string          `json:"type"`
	Layout           json.RawMessage `json:"layout"`
}

func ValidateRecipeBundle(bundle RecipeBundle) error {
	if bundle.Format != RecipeBundleFormat {
		return fmt.Errorf("unsupported recipe bundle format %q", bundle.Format)
	}
	if bundle.Version != RecipeBundleVersion {
		return fmt.Errorf("unsupported recipe bundle version %d", bundle.Version)
	}

	recipes := map[string]bool{}
	for _, r := range bundle.Recipes {
		if r.BundleRecipeID == "" {
			return errors.New("recipe bundleRecipeId is required")
		}
		if strings.TrimSpace(r.Name) == "" {
			return fmt.Errorf("recipe %q name is required", r.BundleRecipeID)
		}
		if r.Servings < 1 {
			return fmt.Errorf("recipe %q servings must be at least 1", r.BundleRecipeID)
		}
		recipes[r.BundleRecipeID] = true
	}

	foodItems := map[int]bool{}
	for _, f := range bundle.FoodItems {
		if f.FdcID <= 0 {
			return errors.New("food item fdcId is required")
		}
		foodItems[f.FdcID] = true
	}
	customFoods := map[string]bool{}
	for _, f := range bundle.CustomFoods {
		if f.BundleCustomFoodID == "" {
			return errors.New("custom food bundleCustomFoodId is required")
		}
		if strings.TrimSpace(f.Name) == "" {
			return fmt.Errorf("custom food %q name is required", f.BundleCustomFoodID)
		}
		customFoods[f.BundleCustomFoodID] = true
	}

	for _, r := range bundle.Recipes {
		groups := map[string]bool{}
		for _, g := range r.IngredientGroups {
			if g.BundleGroupID == "" {
				return fmt.Errorf("recipe %q ingredient group id is required", r.BundleRecipeID)
			}
			groups[g.BundleGroupID] = true
		}
		for _, ing := range r.Ingredients {
			if ing.BundleIngredientID == "" {
				return fmt.Errorf("recipe %q ingredient id is required", r.BundleRecipeID)
			}
			if strings.TrimSpace(ing.Name) == "" {
				return fmt.Errorf("recipe %q ingredient name is required", r.BundleRecipeID)
			}
			if ing.BundleGroupID != nil && !groups[*ing.BundleGroupID] {
				return fmt.Errorf("recipe %q ingredient %q references missing group %q", r.BundleRecipeID, ing.BundleIngredientID, *ing.BundleGroupID)
			}
			if err := validateIngredientSource(ing.Source, recipes, foodItems, customFoods); err != nil {
				return fmt.Errorf("recipe %q ingredient %q source: %w", r.BundleRecipeID, ing.BundleIngredientID, err)
			}
		}
	}

	books := map[string]bool{}
	for _, b := range bundle.Books {
		if b.BundleBookID == "" {
			return errors.New("book bundleBookId is required")
		}
		if strings.TrimSpace(b.Title) == "" {
			return fmt.Errorf("book %q title is required", b.BundleBookID)
		}
		books[b.BundleBookID] = true
	}
	chapters := map[string]bool{}
	for _, ch := range bundle.Chapters {
		if ch.BundleChapterID == "" {
			return errors.New("chapter bundleChapterId is required")
		}
		if !books[ch.BundleBookID] {
			return fmt.Errorf("chapter %q references missing book %q", ch.BundleChapterID, ch.BundleBookID)
		}
		chapters[ch.BundleChapterID] = true
	}
	for _, cr := range bundle.ChapterRecipes {
		if !chapters[cr.BundleChapterID] {
			return fmt.Errorf("chapter recipe references missing chapter %q", cr.BundleChapterID)
		}
		if !recipes[cr.BundleRecipeID] {
			return fmt.Errorf("chapter recipe references missing recipe %q", cr.BundleRecipeID)
		}
	}
	for _, p := range bundle.ChapterPages {
		if p.BundleChapterPageID == "" {
			return errors.New("chapter page bundleChapterPageId is required")
		}
		if !chapters[p.BundleChapterID] {
			return fmt.Errorf("chapter page %q references missing chapter %q", p.BundleChapterPageID, p.BundleChapterID)
		}
	}
	for _, p := range bundle.BookPages {
		if p.BundleBookPageID == "" {
			return errors.New("book page bundleBookPageId is required")
		}
		if !books[p.BundleBookID] {
			return fmt.Errorf("book page %q references missing book %q", p.BundleBookPageID, p.BundleBookID)
		}
	}

	categories := map[string]bool{}
	for _, c := range bundle.Categories {
		if c.BundleCategoryID == "" {
			return errors.New("category bundleCategoryId is required")
		}
		if strings.TrimSpace(c.Name) == "" {
			return fmt.Errorf("category %q name is required", c.BundleCategoryID)
		}
		categories[c.BundleCategoryID] = true
	}
	for _, c := range bundle.Categories {
		if c.ParentBundleCategoryID != nil && !categories[*c.ParentBundleCategoryID] {
			return fmt.Errorf("category %q references missing parent category %q", c.BundleCategoryID, *c.ParentBundleCategoryID)
		}
	}
	for _, rc := range bundle.RecipeCategories {
		if !recipes[rc.BundleRecipeID] {
			return fmt.Errorf("recipe category references missing recipe %q", rc.BundleRecipeID)
		}
		if !categories[rc.BundleCategoryID] {
			return fmt.Errorf("recipe category references missing category %q", rc.BundleCategoryID)
		}
	}
	return nil
}

func validateIngredientSource(src BundleIngredientSourceRef, recipes map[string]bool, foodItems map[int]bool, customFoods map[string]bool) error {
	switch src.Type {
	case "usda":
		if src.FdcID <= 0 {
			return errors.New("usda fdcId is required")
		}
		// A bundle is expected to include the supporting food row. Keep this as a
		// validation error so exports remain self-contained.
		if !foodItems[src.FdcID] {
			return fmt.Errorf("usda food item %d is missing from foodItems", src.FdcID)
		}
	case "custom_food":
		if src.BundleCustomFoodID == "" {
			return errors.New("custom food bundleCustomFoodId is required")
		}
		if !customFoods[src.BundleCustomFoodID] {
			return fmt.Errorf("custom food %q is missing from customFoods", src.BundleCustomFoodID)
		}
	case "recipe":
		if src.BundleRecipeID == "" {
			return errors.New("linked recipe bundleRecipeId is required")
		}
		if !recipes[src.BundleRecipeID] {
			return fmt.Errorf("linked recipe %q is missing from recipes", src.BundleRecipeID)
		}
	case "manual":
		return nil
	default:
		return fmt.Errorf("unsupported source type %q", src.Type)
	}
	return nil
}

func RecipeBundleContentHash(kind string, v interface{}) (string, error) {
	canonical, err := canonicalizeForHash(kind, v)
	if err != nil {
		return "", err
	}
	body, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(body)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func canonicalizeForHash(kind string, v interface{}) (interface{}, error) {
	body, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var x interface{}
	if err := json.Unmarshal(body, &x); err != nil {
		return nil, err
	}
	stripHashIgnoredFields(x)
	if kind == "custom_food" {
		if m, ok := x.(map[string]interface{}); ok {
			delete(m, "bundleCustomFoodId")
		}
	}
	if kind == "bundle" {
		if m, ok := x.(map[string]interface{}); ok {
			sortArrayByKey(m, "recipes", "bundleRecipeId")
			sortArrayByKey(m, "books", "bundleBookId")
			sortArrayByKey(m, "chapters", "bundleChapterId")
			sortArrayByKey(m, "chapterRecipes", "bundleRecipeId")
			sortArrayByKey(m, "chapterPages", "bundleChapterPageId")
			sortArrayByKey(m, "bookPages", "bundleBookPageId")
			sortArrayByKey(m, "categories", "bundleCategoryId")
			sortArrayByKey(m, "recipeCategories", "bundleRecipeId")
			sortArrayByKey(m, "templates", "bundleTemplateId")
			sortArrayByKey(m, "foodItems", "fdcId")
			sortArrayByKey(m, "customFoods", "bundleCustomFoodId")
		}
	}
	return x, nil
}

func stripHashIgnoredFields(v interface{}) {
	switch x := v.(type) {
	case map[string]interface{}:
		for _, k := range []string{
			"sourceRecipeId", "sourceIngredientId", "sourceFoodItemId", "sourceCustomFoodId",
			"sourceBookId", "sourceChapterId", "sourceChapterPageId", "sourceBookPageId",
			"sourceCategoryId", "sourceTemplateId", "createdAt", "updatedAt", "id",
		} {
			delete(x, k)
		}
		for _, child := range x {
			stripHashIgnoredFields(child)
		}
	case []interface{}:
		for _, child := range x {
			stripHashIgnoredFields(child)
		}
	}
}

func sortArrayByKey(m map[string]interface{}, field, key string) {
	arr, ok := m[field].([]interface{})
	if !ok {
		return
	}
	sort.SliceStable(arr, func(i, j int) bool {
		return fmt.Sprint(lookupKey(arr[i], key)) < fmt.Sprint(lookupKey(arr[j], key))
	})
}

func lookupKey(v interface{}, key string) interface{} {
	if m, ok := v.(map[string]interface{}); ok {
		return m[key]
	}
	return ""
}

type ImportStep string

const (
	ImportStepUpsertFoodItems          ImportStep = "upsert_food_items"
	ImportStepUpsertCustomFoods        ImportStep = "upsert_custom_foods"
	ImportStepUpsertCategories         ImportStep = "upsert_categories"
	ImportStepUpsertTemplates          ImportStep = "upsert_templates"
	ImportStepCreateRecipeShells       ImportStep = "create_recipe_shells"
	ImportStepHydrateRecipes           ImportStep = "hydrate_recipes"
	ImportStepAssignRecipeCategories   ImportStep = "assign_recipe_categories"
	ImportStepRebuildCookbookStructure ImportStep = "rebuild_cookbook_structure"
)

type RecipeBundleImportPlan struct {
	Steps                    []ImportStep
	RecipeShells             []string
	RecipeLinkRemaps         []RecipeLinkRemap
	Books                    []string
	Chapters                 []string
	ChapterRecipes           []ChapterRecipePlan
	Categories               []string
	RecipeCategories         []RecipeCategoryPlan
	TemplateReferenceActions []TemplateReferenceAction
}

type RecipeLinkRemap struct {
	FromRecipeID string
	ToRecipeID   string
}

type ChapterRecipePlan struct {
	BundleChapterID string
	BundleRecipeID  string
}

type RecipeCategoryPlan struct {
	BundleRecipeID   string
	BundleCategoryID string
}

type TemplateReferenceAction struct {
	BundleChapterID  string
	Kind             string
	BundleTemplateID string
	Action           string
}

func PlanRecipeBundleImport(bundle RecipeBundle) (*RecipeBundleImportPlan, error) {
	if err := ValidateRecipeBundle(bundle); err != nil {
		return nil, err
	}
	plan := &RecipeBundleImportPlan{Steps: []ImportStep{
		ImportStepUpsertFoodItems,
		ImportStepUpsertCustomFoods,
		ImportStepUpsertCategories,
		ImportStepUpsertTemplates,
		ImportStepCreateRecipeShells,
		ImportStepHydrateRecipes,
		ImportStepAssignRecipeCategories,
		ImportStepRebuildCookbookStructure,
	}}

	templates := map[string]bool{}
	for _, tmpl := range bundle.Templates {
		templates[tmpl.BundleTemplateID] = true
	}
	for _, r := range bundle.Recipes {
		plan.RecipeShells = append(plan.RecipeShells, r.BundleRecipeID)
		for _, ing := range r.Ingredients {
			if ing.Source.Type == "recipe" {
				plan.RecipeLinkRemaps = append(plan.RecipeLinkRemaps, RecipeLinkRemap{FromRecipeID: r.BundleRecipeID, ToRecipeID: ing.Source.BundleRecipeID})
			}
		}
	}
	for _, b := range bundle.Books {
		plan.Books = append(plan.Books, b.BundleBookID)
	}
	for _, ch := range bundle.Chapters {
		plan.Chapters = append(plan.Chapters, ch.BundleChapterID)
		if ch.BundlePageTemplateID != nil && !templates[*ch.BundlePageTemplateID] {
			plan.TemplateReferenceActions = append(plan.TemplateReferenceActions, TemplateReferenceAction{BundleChapterID: ch.BundleChapterID, Kind: "page", BundleTemplateID: *ch.BundlePageTemplateID, Action: "clear"})
		}
		if ch.BundleRecipeTemplateID != nil && !templates[*ch.BundleRecipeTemplateID] {
			plan.TemplateReferenceActions = append(plan.TemplateReferenceActions, TemplateReferenceAction{BundleChapterID: ch.BundleChapterID, Kind: "recipe", BundleTemplateID: *ch.BundleRecipeTemplateID, Action: "clear"})
		}
	}
	for _, cr := range bundle.ChapterRecipes {
		plan.ChapterRecipes = append(plan.ChapterRecipes, ChapterRecipePlan{BundleChapterID: cr.BundleChapterID, BundleRecipeID: cr.BundleRecipeID})
	}
	for _, c := range bundle.Categories {
		plan.Categories = append(plan.Categories, c.BundleCategoryID)
	}
	for _, rc := range bundle.RecipeCategories {
		plan.RecipeCategories = append(plan.RecipeCategories, RecipeCategoryPlan{BundleRecipeID: rc.BundleRecipeID, BundleCategoryID: rc.BundleCategoryID})
	}
	return plan, nil
}

func (p *RecipeBundleImportPlan) StepIndex(step ImportStep) int {
	for i, s := range p.Steps {
		if s == step {
			return i
		}
	}
	return -1
}
func (p *RecipeBundleImportPlan) RequiresRecipeShell(id string) bool {
	return containsString(p.RecipeShells, id)
}
func (p *RecipeBundleImportPlan) RequiresRecipeLinkRemap(from, to string) bool {
	for _, r := range p.RecipeLinkRemaps {
		if r.FromRecipeID == from && r.ToRecipeID == to {
			return true
		}
	}
	return false
}
func (p *RecipeBundleImportPlan) RequiresBook(id string) bool { return containsString(p.Books, id) }
func (p *RecipeBundleImportPlan) RequiresChapter(id string) bool {
	return containsString(p.Chapters, id)
}
func (p *RecipeBundleImportPlan) RequiresChapterRecipe(chapterID, recipeID string) bool {
	for _, r := range p.ChapterRecipes {
		if r.BundleChapterID == chapterID && r.BundleRecipeID == recipeID {
			return true
		}
	}
	return false
}
func (p *RecipeBundleImportPlan) ClearsMissingTemplateReference(chapterID, kind, templateID string) bool {
	for _, a := range p.TemplateReferenceActions {
		if a.BundleChapterID == chapterID && a.Kind == kind && a.BundleTemplateID == templateID && a.Action == "clear" {
			return true
		}
	}
	return false
}
func (p *RecipeBundleImportPlan) RequiresCategory(id string) bool {
	return containsString(p.Categories, id)
}
func (p *RecipeBundleImportPlan) RequiresRecipeCategory(recipeID, categoryID string) bool {
	for _, r := range p.RecipeCategories {
		if r.BundleRecipeID == recipeID && r.BundleCategoryID == categoryID {
			return true
		}
	}
	return false
}
func containsString(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}

type RecipeBundleImportSummary struct {
	Created   map[string]int         `json:"created"`
	Updated   map[string]int         `json:"updated"`
	Reused    map[string]int         `json:"reused"`
	Skipped   map[string]int         `json:"skipped"`
	Conflicts []RecipeBundleConflict `json:"conflicts"`
}

type RecipeBundleConflict struct {
	ObjectType string `json:"objectType"`
	ObjectKey  string `json:"objectKey"`
	Name       string `json:"name"`
	Reason     string `json:"reason"`
}

func newRecipeBundleImportSummary() RecipeBundleImportSummary {
	return RecipeBundleImportSummary{Created: map[string]int{}, Updated: map[string]int{}, Reused: map[string]int{}, Skipped: map[string]int{}, Conflicts: []RecipeBundleConflict{}}
}

func incCount(m map[string]int, key string) { m[key] = m[key] + 1 }

// ImportRecipeBundle persists a DietLedger bundle for userID. It intentionally
// lives on PostgresStore because import is a transactional persistence workflow.
func (s *PostgresStore) ImportRecipeBundle(userID string, bundle RecipeBundle) (*RecipeBundleImportSummary, error) {
	if _, err := PlanRecipeBundleImport(bundle); err != nil {
		return nil, err
	}
	summary := newRecipeBundleImportSummary()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	recipeMap := map[string]string{}
	customFoodMap := map[string]string{}
	categoryMap := map[string]string{}
	bookMap := map[string]string{}
	chapterMap := map[string]string{}
	templateMap := map[string]string{}

	for _, f := range bundle.FoodItems {
		var existing int
		err := tx.QueryRow(`SELECT id FROM food_items WHERE fdc_id = $1`, f.FdcID).Scan(&existing)
		if err == nil {
			incCount(summary.Reused, "foods")
			continue
		}
		if err != sql.ErrNoRows {
			return nil, err
		}
		_, err = tx.Exec(`INSERT INTO food_items (fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),NOW())`, f.FdcID, f.Description, f.DataType, f.BrandOwner, f.GtinUpc, f.ServingSize, f.ServingSizeUnit, f.Nutrients.Calories, f.Nutrients.TotalFat, f.Nutrients.SaturatedFat, f.Nutrients.TransFat, f.Nutrients.Cholesterol, f.Nutrients.Sodium, f.Nutrients.TotalCarbs, f.Nutrients.DietaryFiber, f.Nutrients.TotalSugars, f.Nutrients.AddedSugars, f.Nutrients.Protein, f.Nutrients.VitaminD, f.Nutrients.Calcium, f.Nutrients.Iron, f.Nutrients.Potassium, emptyDefault(f.Source, "usda"))
		if err != nil {
			return nil, err
		}
		incCount(summary.Created, "foods")
	}

	for _, f := range bundle.CustomFoods {
		hash, _ := RecipeBundleContentHash("custom_food", f)
		id, found, err := s.lookupImportMappingTx(tx, userID, "custom_food", f.BundleCustomFoodID)
		if err != nil {
			return nil, err
		}
		if found {
			customFoodMap[f.BundleCustomFoodID] = id
			incCount(summary.Reused, "customFoods")
			continue
		}
		id, found, err = s.lookupImportMappingByHashTx(tx, userID, "custom_food", hash)
		if err != nil {
			return nil, err
		}
		if found {
			customFoodMap[f.BundleCustomFoodID] = id
			_ = s.upsertImportMappingTx(tx, userID, "custom_food", f.BundleCustomFoodID, hash, "custom_foods", id)
			incCount(summary.Reused, "customFoods")
			continue
		}
		id = uuid.New().String()
		_, err = tx.Exec(`INSERT INTO custom_foods (id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())`, id, userID, f.Name, f.Nutrients.Calories, f.Nutrients.TotalFat, f.Nutrients.SaturatedFat, f.Nutrients.TransFat, f.Nutrients.Cholesterol, f.Nutrients.Sodium, f.Nutrients.TotalCarbs, f.Nutrients.DietaryFiber, f.Nutrients.TotalSugars, f.Nutrients.AddedSugars, f.Nutrients.Protein, f.Nutrients.VitaminD, f.Nutrients.Calcium, f.Nutrients.Iron, f.Nutrients.Potassium)
		if err != nil {
			return nil, err
		}
		customFoodMap[f.BundleCustomFoodID] = id
		_ = s.upsertImportMappingTx(tx, userID, "custom_food", f.BundleCustomFoodID, hash, "custom_foods", id)
		incCount(summary.Created, "customFoods")
	}

	for _, c := range bundle.Categories {
		parentID := (*string)(nil)
		if c.ParentBundleCategoryID != nil {
			if p := categoryMap[*c.ParentBundleCategoryID]; p != "" {
				parentID = &p
			}
		}
		id, err := s.findOrCreateCategoryTx(tx, c.Name, parentID)
		if err != nil {
			return nil, err
		}
		categoryMap[c.BundleCategoryID] = id
	}

	for _, t := range bundle.Templates {
		hash, _ := RecipeBundleContentHash("template", t)
		id, found, err := s.lookupImportMappingTx(tx, userID, "template", t.BundleTemplateID)
		if err != nil {
			return nil, err
		}
		if !found {
			id, found, err = s.lookupImportMappingByHashTx(tx, userID, "template", hash)
			if err != nil {
				return nil, err
			}
		}
		if found {
			templateMap[t.BundleTemplateID] = id
			incCount(summary.Reused, "templates")
			continue
		}
		id = uuid.New().String()
		_, err = tx.Exec(`INSERT INTO templates (id, user_id, name, type, layout, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`, id, userID, t.Name, t.Type, string(t.Layout))
		if err != nil {
			return nil, err
		}
		templateMap[t.BundleTemplateID] = id
		_ = s.upsertImportMappingTx(tx, userID, "template", t.BundleTemplateID, hash, "templates", id)
		incCount(summary.Created, "templates")
	}

	for _, r := range bundle.Recipes {
		hash, _ := RecipeBundleContentHash("recipe", r)
		id, found, err := s.lookupImportMappingTx(tx, userID, "recipe", r.BundleRecipeID)
		if err != nil {
			return nil, err
		}
		if found {
			found, err = s.recipeTargetExistsTx(tx, userID, id)
			if err != nil {
				return nil, err
			}
		}
		if !found {
			id, found, err = s.lookupImportMappingByHashTx(tx, userID, "recipe", hash)
			if err != nil {
				return nil, err
			}
			if found {
				found, err = s.recipeTargetExistsTx(tx, userID, id)
				if err != nil {
					return nil, err
				}
			}
		}
		if found {
			recipeMap[r.BundleRecipeID] = id
			incCount(summary.Updated, "recipes")
			continue
		}
		conflict, err := s.recipeNameConflictTx(tx, userID, r.Name, hash)
		if err != nil {
			return nil, err
		}
		if conflict {
			summary.Conflicts = append(summary.Conflicts, RecipeBundleConflict{ObjectType: "recipe", ObjectKey: r.BundleRecipeID, Name: r.Name, Reason: "same name exists with different content"})
			incCount(summary.Skipped, "recipes")
			continue
		}
		id = uuid.New().String()
		servingName := emptyDefault(r.ServingName, "serving")
		groupsJSON, _ := json.Marshal(bundleGroupsToIngredientGroups(r.IngredientGroups))
		_, err = tx.Exec(`INSERT INTO recipes (id, user_id, name, servings, serving_name, prep_time, cook_time, instructions, leftover_storage, ingredient_groups, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`, id, userID, r.Name, r.Servings, servingName, r.PrepTime, r.CookTime, r.Instructions, r.LeftoverStorage, string(groupsJSON))
		if err != nil {
			return nil, err
		}
		recipeMap[r.BundleRecipeID] = id
		_ = s.upsertImportMappingTx(tx, userID, "recipe", r.BundleRecipeID, hash, "recipes", id)
		incCount(summary.Created, "recipes")
	}

	for _, r := range bundle.Recipes {
		id := recipeMap[r.BundleRecipeID]
		if id == "" {
			continue
		}
		if err := s.hydrateRecipeTx(tx, id, r, recipeMap, customFoodMap); err != nil {
			return nil, err
		}
	}

	for _, rc := range bundle.RecipeCategories {
		rid, cid := recipeMap[rc.BundleRecipeID], categoryMap[rc.BundleCategoryID]
		if rid == "" || cid == "" {
			continue
		}
		_, _ = tx.Exec(`INSERT INTO recipe_categories (id, recipe_id, category_id) VALUES ($1,$2,$3) ON CONFLICT (recipe_id, category_id) DO NOTHING`, uuid.New().String(), rid, cid)
	}

	for _, b := range bundle.Books {
		hash, _ := RecipeBundleContentHash("book", b)
		id, found, err := s.lookupImportMappingTx(tx, userID, "book", b.BundleBookID)
		if err != nil {
			return nil, err
		}
		if found {
			found, err = s.bookTargetExistsTx(tx, userID, id)
			if err != nil {
				return nil, err
			}
		}
		if !found {
			id, found, err = s.lookupImportMappingByHashTx(tx, userID, "book", hash)
			if err != nil {
				return nil, err
			}
			if found {
				found, err = s.bookTargetExistsTx(tx, userID, id)
				if err != nil {
					return nil, err
				}
			}
		}
		if found {
			_, err = tx.Exec(`UPDATE recipe_books SET title=$1, description=$2, cover_color=$3, updated_at=NOW() WHERE user_id=$4 AND id=$5`, b.Title, b.Description, emptyDefault(b.CoverColor, "#059669"), userID, id)
			if err != nil {
				return nil, err
			}
			_, _ = tx.Exec(`DELETE FROM book_pages WHERE book_id=$1`, id)
			_, _ = tx.Exec(`DELETE FROM chapters WHERE book_id=$1`, id)
			if err := s.upsertImportMappingTx(tx, userID, "book", b.BundleBookID, hash, "recipe_books", id); err != nil {
				return nil, err
			}
			incCount(summary.Updated, "books")
		} else {
			id = uuid.New().String()
			_, err = tx.Exec(`INSERT INTO recipe_books (id, user_id, title, description, cover_color, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`, id, userID, b.Title, b.Description, emptyDefault(b.CoverColor, "#059669"))
			if err != nil {
				return nil, err
			}
			_ = s.upsertImportMappingTx(tx, userID, "book", b.BundleBookID, hash, "recipe_books", id)
			incCount(summary.Created, "books")
		}
		bookMap[b.BundleBookID] = id
	}
	for _, bp := range bundle.BookPages {
		if bid := bookMap[bp.BundleBookID]; bid != "" {
			id := uuid.New().String()
			_, err := tx.Exec(`INSERT INTO book_pages (id, book_id, title, content, position, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`, id, bid, bp.Title, bp.Content, bp.Position)
			if err != nil {
				return nil, err
			}
			_ = s.upsertImportMappingTx(tx, userID, "book_page", bp.BundleBookPageID, "", "book_pages", id)
		}
	}
	for _, ch := range bundle.Chapters {
		bid := bookMap[ch.BundleBookID]
		if bid == "" {
			continue
		}
		id := uuid.New().String()
		var pageTmpl, recipeTmpl *string
		if ch.BundlePageTemplateID != nil {
			if mapped := templateMap[*ch.BundlePageTemplateID]; mapped != "" {
				pageTmpl = &mapped
			}
		}
		if ch.BundleRecipeTemplateID != nil {
			if mapped := templateMap[*ch.BundleRecipeTemplateID]; mapped != "" {
				recipeTmpl = &mapped
			}
		}
		_, err := tx.Exec(`INSERT INTO chapters (id, book_id, title, position, page_template_id, recipe_template_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`, id, bid, ch.Title, ch.Position, pageTmpl, recipeTmpl)
		if err != nil {
			return nil, err
		}
		chapterMap[ch.BundleChapterID] = id
		_ = s.upsertImportMappingTx(tx, userID, "chapter", ch.BundleChapterID, "", "chapters", id)
	}
	for _, cp := range bundle.ChapterPages {
		if cid := chapterMap[cp.BundleChapterID]; cid != "" {
			id := uuid.New().String()
			_, err := tx.Exec(`INSERT INTO chapter_pages (id, chapter_id, title, content, position, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`, id, cid, cp.Title, cp.Content, cp.Position)
			if err != nil {
				return nil, err
			}
			_ = s.upsertImportMappingTx(tx, userID, "chapter_page", cp.BundleChapterPageID, "", "chapter_pages", id)
		}
	}
	for _, cr := range bundle.ChapterRecipes {
		cid, rid := chapterMap[cr.BundleChapterID], recipeMap[cr.BundleRecipeID]
		if cid != "" && rid != "" {
			_, err := tx.Exec(`INSERT INTO chapter_recipes (id, chapter_id, recipe_id, position) VALUES ($1,$2,$3,$4) ON CONFLICT (chapter_id, recipe_id) DO UPDATE SET position=EXCLUDED.position`, uuid.New().String(), cid, rid, cr.Position)
			if err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &summary, nil
}

func emptyDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func bundleGroupsToIngredientGroups(groups []BundleIngredientGroup) []IngredientGroupJSON {
	out := make([]IngredientGroupJSON, 0, len(groups))
	for _, g := range groups {
		out = append(out, IngredientGroupJSON{ID: g.BundleGroupID, Title: g.Title})
	}
	return out
}

func (s *PostgresStore) hydrateRecipeTx(tx *sql.Tx, recipeID string, r BundleRecipe, recipeMap, customFoodMap map[string]string) error {
	groupsJSON, _ := json.Marshal(bundleGroupsToIngredientGroups(r.IngredientGroups))
	_, err := tx.Exec(`UPDATE recipes SET name=$1, servings=$2, serving_name=$3, prep_time=$4, cook_time=$5, instructions=$6, leftover_storage=$7, ingredient_groups=$8, updated_at=NOW() WHERE id=$9`, r.Name, r.Servings, emptyDefault(r.ServingName, "serving"), r.PrepTime, r.CookTime, r.Instructions, r.LeftoverStorage, string(groupsJSON), recipeID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`DELETE FROM ingredients WHERE recipe_id=$1`, recipeID)
	if err != nil {
		return err
	}
	for _, ing := range r.Ingredients {
		id := uuid.New().String()
		prepJSON := PrepInstructionsJSON(ing.PrepInstructions)
		fdcID := 0
		sourceType := ing.Source.Type
		sourceKey := ""
		var linkedRecipeID *string
		switch ing.Source.Type {
		case "usda":
			fdcID = ing.Source.FdcID
			sourceKey = fmt.Sprint(ing.Source.FdcID)
		case "custom_food":
			sourceKey = customFoodMap[ing.Source.BundleCustomFoodID]
		case "recipe":
			if mapped := recipeMap[ing.Source.BundleRecipeID]; mapped != "" {
				linkedRecipeID = &mapped
				sourceKey = mapped
			}
		case "manual":
			sourceKey = ""
		}
		_, err = tx.Exec(`INSERT INTO ingredients (id, recipe_id, fdc_id, name, amount, unit, description, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, prep_instructions, storage_location, group_id, linked_recipe_id, source_type, source_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`, id, recipeID, fdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Nutrients.Calories, ing.Nutrients.TotalFat, ing.Nutrients.SaturatedFat, ing.Nutrients.TransFat, ing.Nutrients.Cholesterol, ing.Nutrients.Sodium, ing.Nutrients.TotalCarbs, ing.Nutrients.DietaryFiber, ing.Nutrients.TotalSugars, ing.Nutrients.AddedSugars, ing.Nutrients.Protein, ing.Nutrients.VitaminD, ing.Nutrients.Calcium, ing.Nutrients.Iron, ing.Nutrients.Potassium, prepJSON, ing.StorageLocation, ing.BundleGroupID, linkedRecipeID, sourceType, nullableString(sourceKey))
		if err != nil {
			return err
		}
	}
	return nil
}

func nullableString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func (s *PostgresStore) bookTargetExistsTx(tx *sql.Tx, userID, bookID string) (bool, error) {
	var exists bool
	err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipe_books WHERE id=$1 AND user_id=$2)`, bookID, userID).Scan(&exists)
	return exists, err
}

func (s *PostgresStore) recipeTargetExistsTx(tx *sql.Tx, userID, recipeID string) (bool, error) {
	var exists bool
	err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipes WHERE id=$1 AND user_id=$2)`, recipeID, userID).Scan(&exists)
	return exists, err
}

func (s *PostgresStore) lookupImportMappingTx(tx *sql.Tx, userID, objectType, objectKey string) (string, bool, error) {
	var target string
	err := tx.QueryRow(`SELECT target_id FROM import_object_mappings WHERE user_id=$1 AND source_format=$2 AND source_object_type=$3 AND source_object_key=$4`, userID, RecipeBundleFormat, objectType, objectKey).Scan(&target)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return target, true, nil
}
func (s *PostgresStore) lookupImportMappingByHashTx(tx *sql.Tx, userID, objectType, hash string) (string, bool, error) {
	if hash == "" {
		return "", false, nil
	}
	var target string
	err := tx.QueryRow(`SELECT target_id FROM import_object_mappings WHERE user_id=$1 AND source_format=$2 AND source_object_type=$3 AND content_hash=$4 ORDER BY created_at LIMIT 1`, userID, RecipeBundleFormat, objectType, hash).Scan(&target)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return target, true, nil
}
func (s *PostgresStore) upsertImportMappingTx(tx *sql.Tx, userID, objectType, objectKey, contentHash, targetTable, targetID string) error {
	if contentHash == "" {
		contentHash = "sha256:untracked:" + objectType + ":" + objectKey
	}
	_, err := tx.Exec(`INSERT INTO import_object_mappings (id, user_id, source_format, source_object_type, source_object_key, content_hash, target_table, target_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) ON CONFLICT (user_id, source_format, source_object_type, source_object_key) DO UPDATE SET content_hash=EXCLUDED.content_hash, target_table=EXCLUDED.target_table, target_id=EXCLUDED.target_id, updated_at=NOW()`, uuid.New().String(), userID, RecipeBundleFormat, objectType, objectKey, contentHash, targetTable, targetID)
	return err
}

func (s *PostgresStore) recipeNameConflictTx(tx *sql.Tx, userID, name, hash string) (bool, error) {
	var id string
	err := tx.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND name=$2 LIMIT 1`, userID, name).Scan(&id)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var mapped string
	err = tx.QueryRow(`SELECT target_id FROM import_object_mappings WHERE user_id=$1 AND source_format=$2 AND source_object_type='recipe' AND target_id=$3 AND content_hash=$4`, userID, RecipeBundleFormat, id, hash).Scan(&mapped)
	if err == nil {
		return false, nil
	}
	if err != sql.ErrNoRows {
		return false, err
	}
	return true, nil
}

func (s *PostgresStore) findOrCreateCategoryTx(tx *sql.Tx, name string, parentID *string) (string, error) {
	var id string
	err := tx.QueryRow(`SELECT id FROM categories WHERE name=$1 AND (($2::text IS NULL AND parent_id IS NULL) OR parent_id=$2) LIMIT 1`, name, parentID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return "", err
	}
	id = uuid.New().String()
	_, err = tx.Exec(`INSERT INTO categories (id, name, parent_id, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW())`, id, name, parentID)
	return id, err
}

func (s *PostgresStore) ListRecipeBundleExportCandidates(user *User) ([]ExportCandidate, error) {
	candidates := []ExportCandidate{}
	isAdmin := user != nil && user.IsAdmin
	userID := ""
	if user != nil {
		userID = user.ID
	}

	recipeRows, err := s.db.Query(`
		SELECT r.id,
		       r.name,
		       COALESCE(pub.description, '') AS description,
		       CONCAT_WS(' ', r.name, COALESCE(pub.description, ''), COALESCE(r.instructions, '')) AS search_text,
		       r.user_id,
		       CASE WHEN r.user_id = $1 THEN 'owned' WHEN $2 THEN 'admin' ELSE 'public' END AS access
		  FROM recipes r
		  LEFT JOIN LATERAL (
		    SELECT recipe_id, description
		      FROM shared_recipes
		     WHERE recipe_id = r.id AND visibility = 'public'
		     ORDER BY updated_at DESC
		     LIMIT 1
		  ) pub ON TRUE
		 WHERE $2 OR r.user_id = $1 OR pub.recipe_id IS NOT NULL
		 ORDER BY LOWER(r.name), r.updated_at DESC`, userID, isAdmin)
	if err != nil {
		return nil, err
	}
	defer recipeRows.Close()
	for recipeRows.Next() {
		var c ExportCandidate
		c.Type = "recipe"
		if err := recipeRows.Scan(&c.ID, &c.Name, &c.Description, &c.SearchText, &c.OwnerUserID, &c.Access); err != nil {
			return nil, err
		}
		candidates = append(candidates, c)
	}
	if err := recipeRows.Err(); err != nil {
		return nil, err
	}

	profileRows, err := s.db.Query(`
		SELECT p.id,
		       p.name,
		       '' AS description,
		       p.name AS search_text,
		       p.user_id,
		       CASE WHEN p.user_id = $1 THEN 'owned' ELSE 'admin' END AS access
		  FROM person_profiles p
		 WHERE $2 OR p.user_id = $1
		 ORDER BY LOWER(p.name), p.updated_at DESC`, userID, isAdmin)
	if err != nil {
		return nil, err
	}
	defer profileRows.Close()
	for profileRows.Next() {
		var c ExportCandidate
		c.Type = "nutritionProfile"
		if err := profileRows.Scan(&c.ID, &c.Name, &c.Description, &c.SearchText, &c.OwnerUserID, &c.Access); err != nil {
			return nil, err
		}
		candidates = append(candidates, c)
	}
	if err := profileRows.Err(); err != nil {
		return nil, err
	}

	mealPlanRows, err := s.db.Query(`
		SELECT m.id,
		       m.name,
		       m.week_start AS description,
		       CONCAT_WS(' ', m.name, m.week_start) AS search_text,
		       m.user_id,
		       CASE WHEN m.user_id = $1 THEN 'owned' ELSE 'admin' END AS access
		  FROM meal_plans m
		 WHERE $2 OR m.user_id = $1
		 ORDER BY m.week_start DESC, LOWER(m.name)`, userID, isAdmin)
	if err != nil {
		return nil, err
	}
	defer mealPlanRows.Close()
	for mealPlanRows.Next() {
		var c ExportCandidate
		c.Type = "mealPlan"
		if err := mealPlanRows.Scan(&c.ID, &c.Name, &c.Description, &c.SearchText, &c.OwnerUserID, &c.Access); err != nil {
			return nil, err
		}
		candidates = append(candidates, c)
	}
	if err := mealPlanRows.Err(); err != nil {
		return nil, err
	}

	bookRows, err := s.db.Query(`
		SELECT b.id,
		       b.title,
		       COALESCE(b.description, '') AS description,
		       CONCAT_WS(' ',
		         b.title,
		         COALESCE(b.description, ''),
		         COALESCE((SELECT STRING_AGG(CONCAT_WS(' ', bp.title, bp.content), ' ') FROM book_pages bp WHERE bp.book_id = b.id), ''),
		         COALESCE((SELECT STRING_AGG(CONCAT_WS(' ', cp.title, cp.content), ' ') FROM chapters ch JOIN chapter_pages cp ON cp.chapter_id = ch.id WHERE ch.book_id = b.id), '')
		       ) AS search_text,
		       b.user_id,
		       CASE WHEN b.user_id = $1 THEN 'owned' ELSE 'admin' END AS access
		  FROM recipe_books b
		 WHERE $2 OR b.user_id = $1
		 ORDER BY LOWER(b.title), b.updated_at DESC`, userID, isAdmin)
	if err != nil {
		return nil, err
	}
	defer bookRows.Close()
	for bookRows.Next() {
		var c ExportCandidate
		c.Type = "book"
		if err := bookRows.Scan(&c.ID, &c.Name, &c.Description, &c.SearchText, &c.OwnerUserID, &c.Access); err != nil {
			return nil, err
		}
		candidates = append(candidates, c)
	}
	return candidates, bookRows.Err()
}

func (s *PostgresStore) ExportRecipeBundleForUser(user *User, recipeIDs, bookIDs, profileIDs, mealPlanIDs []string) (*RecipeBundle, error) {
	bundle := &RecipeBundle{Format: RecipeBundleFormat, Version: RecipeBundleVersion, ExportedAt: time.Now().UTC().Format(time.RFC3339), Source: RecipeBundleSource{App: "DietLedger", Version: version}}
	seenRecipes := map[string]bool{}
	for _, id := range recipeIDs {
		if err := s.addRecipeToBundleForUser(user, id, bundle, seenRecipes); err != nil {
			return nil, err
		}
	}
	for _, bookID := range bookIDs {
		if err := s.addBookToBundleForUser(user, bookID, bundle, seenRecipes); err != nil {
			return nil, err
		}
	}
	for _, profileID := range profileIDs {
		if err := s.addNutritionProfileToBundleForUser(user, profileID, bundle); err != nil {
			return nil, err
		}
	}
	for _, mealPlanID := range mealPlanIDs {
		if err := s.addMealPlanToBundleForUser(user, mealPlanID, bundle, seenRecipes); err != nil {
			return nil, err
		}
	}
	return bundle, nil
}

// ExportRecipeBundle builds a DietLedger bundle for the requested recipes/books.
func (s *PostgresStore) ExportRecipeBundle(userID string, recipeIDs, bookIDs []string) (*RecipeBundle, error) {
	bundle := &RecipeBundle{Format: RecipeBundleFormat, Version: RecipeBundleVersion, ExportedAt: time.Now().UTC().Format(time.RFC3339), Source: RecipeBundleSource{App: "DietLedger", Version: version}}
	seenRecipes := map[string]bool{}
	for _, id := range recipeIDs {
		if err := s.addRecipeToBundle(userID, id, bundle, seenRecipes); err != nil {
			return nil, err
		}
	}
	for _, bookID := range bookIDs {
		if err := s.addBookToBundle(userID, bookID, bundle, seenRecipes); err != nil {
			return nil, err
		}
	}
	return bundle, nil
}

func (s *PostgresStore) getProfileByID(profileID string) (*PersonProfile, error) {
	p := &PersonProfile{}
	err := s.db.QueryRow(`SELECT id, user_id, name, sex, birth_date, height_cm, activity_level, goal_weight_kg, goal_date, bmr_equation, manual_bmr_value, calorie_target, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g, sodium_max_mg, sugar_max_g, vitamin_d_goal_ug, calcium_goal_mg, iron_goal_mg, potassium_goal_mg, created_at, updated_at FROM person_profiles WHERE id = $1`, profileID).Scan(&p.ID, &p.UserID, &p.Name, &p.Sex, &p.BirthDate, &p.HeightCm, &p.ActivityLevel, &p.GoalWeightKg, &p.GoalDate, &p.BMREquation, &p.ManualBMRValue, &p.CalorieTarget, &p.ProteinGoalG, &p.CarbsGoalG, &p.FatGoalG, &p.FiberGoalG, &p.SodiumMaxMg, &p.SugarMaxG, &p.VitaminDGoalUg, &p.CalciumGoalMg, &p.IronGoalMg, &p.PotassiumGoalMg, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *PostgresStore) getMealPlanByID(mealPlanID string) (*MealPlan, error) {
	p := &MealPlan{}
	var slotTimes sql.NullString
	err := s.db.QueryRow(`SELECT id, user_id, name, week_start, slot_times, created_at, updated_at FROM meal_plans WHERE id = $1`, mealPlanID).Scan(&p.ID, &p.UserID, &p.Name, &p.WeekStart, &slotTimes, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.SlotTimes = json.RawMessage(slotTimes.String)
	return p, nil
}

func (s *PostgresStore) getRecipeByID(recipeID string) (*Recipe, error) {
	r := &Recipe{}
	var groupsJSON string
	err := s.db.QueryRow(`SELECT id, user_id, name, servings, serving_name, prep_time, cook_time, instructions, leftover_storage, COALESCE(ingredient_groups,'[]'), created_at, updated_at FROM recipes WHERE id = $1`, recipeID).Scan(&r.ID, &r.UserID, &r.Name, &r.Servings, &r.ServingName, &r.PrepTime, &r.CookTime, &r.Instructions, &r.LeftoverStorage, &groupsJSON, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.ScanIngredientGroups(groupsJSON)
	ings, err := s.listIngredientsByRecipe(r.ID)
	if err != nil {
		return nil, err
	}
	r.Ingredients = ings
	return r, nil
}

func (s *PostgresStore) canExportRecipe(user *User, recipeID string) (bool, error) {
	if user == nil {
		return false, nil
	}
	if user.IsAdmin {
		return true, nil
	}
	var ok bool
	err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipes r WHERE r.id=$1 AND (r.user_id=$2 OR EXISTS(SELECT 1 FROM shared_recipes sr WHERE sr.recipe_id=r.id AND sr.visibility='public')))`, recipeID, user.ID).Scan(&ok)
	return ok, err
}

func (s *PostgresStore) canExportBook(user *User, bookID string) (bool, error) {
	if user == nil {
		return false, nil
	}
	if user.IsAdmin {
		return true, nil
	}
	var ok bool
	err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipe_books WHERE id=$1 AND user_id=$2)`, bookID, user.ID).Scan(&ok)
	return ok, err
}

func (s *PostgresStore) canExportProfile(user *User, profileID string) (bool, error) {
	if user == nil {
		return false, nil
	}
	if user.IsAdmin {
		return true, nil
	}
	var ok bool
	err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM person_profiles WHERE id=$1 AND user_id=$2)`, profileID, user.ID).Scan(&ok)
	return ok, err
}

func (s *PostgresStore) canExportMealPlan(user *User, mealPlanID string) (bool, error) {
	if user == nil {
		return false, nil
	}
	if user.IsAdmin {
		return true, nil
	}
	var ok bool
	err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM meal_plans WHERE id=$1 AND user_id=$2)`, mealPlanID, user.ID).Scan(&ok)
	return ok, err
}

func (s *PostgresStore) addNutritionProfileToBundleForUser(user *User, profileID string, bundle *RecipeBundle) error {
	ok, err := s.canExportProfile(user, profileID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrExportForbidden
	}
	profile, err := s.getProfileByID(profileID)
	if err != nil || profile == nil {
		return err
	}
	bundle.NutritionProfiles = append(bundle.NutritionProfiles, *profile)
	logs, err := s.ListFoodLogEntries(profileID, "")
	if err != nil {
		return err
	}
	bundle.FoodLogEntries = append(bundle.FoodLogEntries, logs...)
	weights, err := s.ListWeightEntries(profileID, "", "")
	if err != nil {
		return err
	}
	bundle.WeightEntries = append(bundle.WeightEntries, weights...)
	return nil
}

func (s *PostgresStore) addMealPlanToBundleForUser(user *User, mealPlanID string, bundle *RecipeBundle, seen map[string]bool) error {
	ok, err := s.canExportMealPlan(user, mealPlanID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrExportForbidden
	}
	plan, err := s.getMealPlanByID(mealPlanID)
	if err != nil || plan == nil {
		return err
	}
	bundle.MealPlans = append(bundle.MealPlans, *plan)
	groups, err := s.ListMealGroups(mealPlanID)
	if err != nil {
		return err
	}
	bundle.MealGroups = append(bundle.MealGroups, groups...)
	entries, err := s.ListDayPlanEntries(mealPlanID)
	if err != nil {
		return err
	}
	bundle.DayPlanEntries = append(bundle.DayPlanEntries, entries...)
	for _, entry := range entries {
		if entry.RecipeID != nil && *entry.RecipeID != "" {
			_ = s.addRecipeToBundleForUser(user, *entry.RecipeID, bundle, seen)
		}
	}
	return nil
}

func (s *PostgresStore) addRecipeToBundleForUser(user *User, recipeID string, bundle *RecipeBundle, seen map[string]bool) error {
	ok, err := s.canExportRecipe(user, recipeID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrExportForbidden
	}
	r, err := s.getRecipeByID(recipeID)
	if err != nil || r == nil {
		return err
	}
	return s.addRecipeRecordToBundle(user, r, bundle, seen)
}

func (s *PostgresStore) addRecipeToBundle(userID, recipeID string, bundle *RecipeBundle, seen map[string]bool) error {
	r, err := s.GetRecipe(userID, recipeID)
	if err != nil || r == nil {
		return err
	}
	return s.addRecipeRecordToBundle(&User{ID: userID}, r, bundle, seen)
}

func (s *PostgresStore) addRecipeRecordToBundle(user *User, r *Recipe, bundle *RecipeBundle, seen map[string]bool) error {
	if seen[r.ID] {
		return nil
	}
	seen[r.ID] = true
	var groups []IngredientGroupJSON
	_ = json.Unmarshal([]byte(r.IngredientGroupsJSON), &groups)
	br := BundleRecipe{BundleRecipeID: r.ID, SourceRecipeID: r.ID, Name: r.Name, Servings: r.Servings, ServingName: r.ServingName, PrepTime: r.PrepTime, CookTime: r.CookTime, Instructions: r.Instructions, LeftoverStorage: r.LeftoverStorage}
	for _, g := range groups {
		br.IngredientGroups = append(br.IngredientGroups, BundleIngredientGroup{BundleGroupID: g.ID, Title: g.Title})
	}
	for _, ing := range r.Ingredients {
		src := BundleIngredientSourceRef{Type: "manual"}
		if ing.LinkedRecipeID != nil && *ing.LinkedRecipeID != "" {
			src = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: *ing.LinkedRecipeID}
			_ = s.addRecipeToBundleForUser(user, *ing.LinkedRecipeID, bundle, seen)
		} else if ing.FdcID > 0 {
			src = BundleIngredientSourceRef{Type: "usda", FdcID: ing.FdcID}
			_ = s.addFoodItemToBundle(ing.FdcID, bundle)
		}
		br.Ingredients = append(br.Ingredients, BundleIngredient{BundleIngredientID: ing.ID, SourceIngredientID: ing.ID, Name: ing.Name, Amount: ing.Amount, Unit: ing.Unit, Description: ing.Description, BundleGroupID: ing.GroupID, PrepInstructions: ing.PrepInstructions, StorageLocation: ing.StorageLocation, Source: src, Nutrients: nutrientsFromIngredient(ing)})
	}
	bundle.Recipes = append(bundle.Recipes, br)
	return nil
}

func (s *PostgresStore) addFoodItemToBundle(fdcID int, bundle *RecipeBundle) error {
	for _, f := range bundle.FoodItems {
		if f.FdcID == fdcID {
			return nil
		}
	}
	f, err := s.GetFoodByFdcID(fdcID)
	if err != nil || f == nil {
		return err
	}
	bundle.FoodItems = append(bundle.FoodItems, BundleFoodItem{SourceFoodItemID: fmt.Sprint(f.ID), FdcID: f.FdcID, Description: f.Description, DataType: f.DataType, BrandOwner: f.BrandOwner, GtinUpc: f.GtinUpc, ServingSize: f.ServingSize, ServingSizeUnit: f.ServingSizeUnit, Source: f.Source, Nutrients: nutrientsFromFoodItem(*f)})
	return nil
}

func (s *PostgresStore) getBookByID(bookID string) (*RecipeBook, error) {
	b := &RecipeBook{}
	err := s.db.QueryRow(`SELECT id, user_id, title, description, cover_color, created_at, updated_at FROM recipe_books WHERE id = $1`, bookID).Scan(&b.ID, &b.UserID, &b.Title, &b.Description, &b.CoverColor, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

func (s *PostgresStore) addBookToBundleForUser(user *User, bookID string, bundle *RecipeBundle, seen map[string]bool) error {
	ok, err := s.canExportBook(user, bookID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrExportForbidden
	}
	b, err := s.getBookByID(bookID)
	if err != nil || b == nil {
		return err
	}
	return s.addBookRecordToBundle(user, b, bundle, seen)
}

func (s *PostgresStore) addBookToBundle(userID, bookID string, bundle *RecipeBundle, seen map[string]bool) error {
	b, err := s.GetBook(userID, bookID)
	if err != nil || b == nil {
		return err
	}
	return s.addBookRecordToBundle(&User{ID: userID}, b, bundle, seen)
}

func (s *PostgresStore) addBookRecordToBundle(user *User, b *RecipeBook, bundle *RecipeBundle, seen map[string]bool) error {
	bookID := b.ID
	bundle.Books = append(bundle.Books, BundleBook{BundleBookID: b.ID, SourceBookID: b.ID, Title: b.Title, Description: b.Description, CoverColor: b.CoverColor})
	pages, _ := s.ListBookPages(bookID)
	for _, p := range pages {
		bundle.BookPages = append(bundle.BookPages, BundleBookPage{BundleBookPageID: p.ID, SourceBookPageID: p.ID, BundleBookID: bookID, Title: p.Title, Content: p.Content, Position: p.Position})
	}
	chapters, _ := s.ListChapters(bookID)
	for _, ch := range chapters {
		bundle.Chapters = append(bundle.Chapters, BundleChapter{BundleChapterID: ch.ID, SourceChapterID: ch.ID, BundleBookID: bookID, Title: ch.Title, Position: ch.Position, BundlePageTemplateID: ch.PageTemplateID, BundleRecipeTemplateID: ch.RecipeTemplateID})
		cps, _ := s.ListChapterPages(ch.ID)
		for _, p := range cps {
			bundle.ChapterPages = append(bundle.ChapterPages, BundleChapterPage{BundleChapterPageID: p.ID, SourceChapterPageID: p.ID, BundleChapterID: ch.ID, Title: p.Title, Content: p.Content, Position: p.Position})
		}
		crs, _ := s.ListChapterRecipes(ch.ID)
		for _, cr := range crs {
			bundle.ChapterRecipes = append(bundle.ChapterRecipes, BundleChapterRecipe{BundleChapterID: ch.ID, BundleRecipeID: cr.RecipeID, Position: cr.Position})
			if err := s.addRecipeToBundleForUser(user, cr.RecipeID, bundle, seen); err != nil {
				return err
			}
		}
	}
	return nil
}

func nutrientsFromIngredient(i Ingredient) BundleNutrients {
	return BundleNutrients{Calories: i.Calories, TotalFat: i.TotalFat, SaturatedFat: i.SaturatedFat, TransFat: i.TransFat, Cholesterol: i.Cholesterol, Sodium: i.Sodium, TotalCarbs: i.TotalCarbs, DietaryFiber: i.DietaryFiber, TotalSugars: i.TotalSugars, AddedSugars: i.AddedSugars, Protein: i.Protein, VitaminD: i.VitaminD, Calcium: i.Calcium, Iron: i.Iron, Potassium: i.Potassium}
}
func nutrientsFromFoodItem(f FoodItem) BundleNutrients {
	return BundleNutrients{Calories: f.Calories, TotalFat: f.TotalFat, SaturatedFat: f.SaturatedFat, TransFat: f.TransFat, Cholesterol: f.Cholesterol, Sodium: f.Sodium, TotalCarbs: f.TotalCarbs, DietaryFiber: f.DietaryFiber, TotalSugars: f.TotalSugars, AddedSugars: f.AddedSugars, Protein: f.Protein, VitaminD: f.VitaminD, Calcium: f.Calcium, Iron: f.Iron, Potassium: f.Potassium}
}
