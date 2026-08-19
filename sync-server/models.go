package main

import (
	"encoding/json"
	"time"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"displayName"`
	PasswordHash string    `json:"-"`
	APIKey       string    `json:"-"`
	IsAdmin      bool      `json:"isAdmin"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Recipe struct {
	ID              string       `json:"id"`
	UserID          string       `json:"userId"`
	Name            string       `json:"name"`
	Servings        int          `json:"servings"`
	ServingName     string       `json:"servingName"`
	PrepTime        *string      `json:"prepTime,omitempty"`
	CookTime        *string      `json:"cookTime,omitempty"`
	Instructions    *string      `json:"instructions,omitempty"`
	LeftoverStorage *string      `json:"leftoverStorage,omitempty"`
	IngredientGroupsJSON string  `json:"ingredientGroups,omitempty"`
	CreatedAt       time.Time    `json:"createdAt"`
	UpdatedAt       time.Time    `json:"updatedAt"`
	Ingredients     []Ingredient `json:"ingredients,omitempty"`
}

func (r *Recipe) ScanIngredientGroups(v string) {
	r.IngredientGroupsJSON = v
}

type IngredientGroupJSON struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type Ingredient struct {
	ID               string   `json:"id"`
	RecipeID         string   `json:"recipeId"`
	FdcID            int      `json:"fdcId"`
	Name             string   `json:"name"`
	Amount           float64  `json:"amount"`
	Unit             string   `json:"unit"`
	Description      string   `json:"description"`
	Calories         float64  `json:"calories"`
	TotalFat         float64  `json:"totalFat"`
	SaturatedFat     float64  `json:"saturatedFat"`
	TransFat         float64  `json:"transFat"`
	Cholesterol      float64  `json:"cholesterol"`
	Sodium           float64  `json:"sodium"`
	TotalCarbs       float64  `json:"totalCarbs"`
	DietaryFiber     float64  `json:"dietaryFiber"`
	TotalSugars      float64  `json:"totalSugars"`
	AddedSugars      float64  `json:"addedSugars"`
	Protein          float64  `json:"protein"`
	VitaminD         float64  `json:"vitaminD"`
	Calcium          float64  `json:"calcium"`
	Iron             float64  `json:"iron"`
	Potassium        float64  `json:"potassium"`
	GroupID          *string  `json:"groupId"`
	LinkedRecipeID   *string  `json:"linkedRecipeId"`
	PrepInstructions []string `json:"prepInstructions"`
	StorageLocation  string   `json:"storageLocation"`
}

func (i *Ingredient) ScanPrepInstructions(v string) {
	if v != "" {
		json.Unmarshal([]byte(v), &i.PrepInstructions)
	}
	if i.PrepInstructions == nil {
		i.PrepInstructions = []string{}
	}
}

func PrepInstructionsJSON(v []string) string {
	if v == nil {
		return "[]"
	}
	b, _ := json.Marshal(v)
	return string(b)
}

type FoodItem struct {
	ID             int     `json:"id"`
	FdcID          int     `json:"fdcId"`
	Description    string  `json:"description"`
	DataType       string  `json:"dataType"`
	BrandOwner     *string `json:"brandOwner,omitempty"`
	GtinUpc        *string `json:"gtinUpc,omitempty"`
	ServingSize    float64 `json:"servingSize"`
	ServingSizeUnit string `json:"servingSizeUnit"`
	Calories       float64 `json:"calories"`
	TotalFat       float64 `json:"totalFat"`
	SaturatedFat   float64 `json:"saturatedFat"`
	TransFat       float64 `json:"transFat"`
	Cholesterol    float64 `json:"cholesterol"`
	Sodium         float64 `json:"sodium"`
	TotalCarbs     float64 `json:"totalCarbs"`
	DietaryFiber   float64 `json:"dietaryFiber"`
	TotalSugars    float64 `json:"totalSugars"`
	AddedSugars    float64 `json:"addedSugars"`
	Protein        float64 `json:"protein"`
	VitaminD       float64 `json:"vitaminD"`
	Calcium        float64 `json:"calcium"`
	Iron           float64 `json:"iron"`
	Potassium      float64 `json:"potassium"`
	Source         string  `json:"source"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type PersonProfile struct {
	ID              string    `json:"id"`
	UserID          string    `json:"userId"`
	Name            string    `json:"name"`
	Sex             string    `json:"sex"`
	BirthDate       *string   `json:"birthDate,omitempty"`
	HeightCm        *float64  `json:"heightCm,omitempty"`
	ActivityLevel   string    `json:"activityLevel"`
	GoalWeightKg    *float64  `json:"goalWeightKg,omitempty"`
	GoalDate        *string   `json:"goalDate,omitempty"`
	BMREquation     *string   `json:"bmrEquation,omitempty"`
	ManualBMRValue  *float64  `json:"manualBmrValue,omitempty"`
	CalorieTarget   *float64  `json:"calorieTarget,omitempty"`
	ProteinGoalG    *float64  `json:"proteinGoalG,omitempty"`
	CarbsGoalG      *float64  `json:"carbsGoalG,omitempty"`
	FatGoalG        *float64  `json:"fatGoalG,omitempty"`
	FiberGoalG      *float64  `json:"fiberGoalG,omitempty"`
	SodiumMaxMg     *float64  `json:"sodiumMaxMg,omitempty"`
	SugarMaxG       *float64  `json:"sugarMaxG,omitempty"`
	VitaminDGoalUg  *float64  `json:"vitaminDGoalUg,omitempty"`
	CalciumGoalMg   *float64  `json:"calciumGoalMg,omitempty"`
	IronGoalMg      *float64  `json:"ironGoalMg,omitempty"`
	PotassiumGoalMg *float64  `json:"potassiumGoalMg,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type FoodLogEntry struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	ProfileID     string    `json:"profileId"`
	Date          string    `json:"date"`
	Time          *string   `json:"time,omitempty"`
	MealSlot      string    `json:"mealSlot"`
	SourceType    string    `json:"sourceType"`
	SourceID      *string   `json:"sourceId,omitempty"`
	Name          string    `json:"name"`
	Servings      float64   `json:"servings"`
	ServingAmount *float64  `json:"servingAmount,omitempty"`
	ServingUnit   *string   `json:"servingUnit,omitempty"`
	Calories      float64   `json:"calories"`
	TotalFat      float64   `json:"totalFat"`
	SaturatedFat  float64   `json:"saturatedFat"`
	TransFat      float64   `json:"transFat"`
	Cholesterol   float64   `json:"cholesterol"`
	Sodium        float64   `json:"sodium"`
	TotalCarbs    float64   `json:"totalCarbs"`
	DietaryFiber  float64   `json:"dietaryFiber"`
	TotalSugars   float64   `json:"totalSugars"`
	AddedSugars   float64   `json:"addedSugars"`
	Protein       float64   `json:"protein"`
	VitaminD      float64   `json:"vitaminD"`
	Calcium       float64   `json:"calcium"`
	Iron          float64   `json:"iron"`
	Potassium     float64   `json:"potassium"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type WeightEntry struct {
	ID                     string    `json:"id"`
	UserID                 string    `json:"userId"`
	ProfileID              string    `json:"profileId"`
	Date                   string    `json:"date"`
	Time                   *string   `json:"time,omitempty"`
	WeightKg               float64   `json:"weightKg"`
	Notes                  *string   `json:"notes,omitempty"`
	BloodSugar             *float64  `json:"bloodSugar,omitempty"`
	BloodPressureSystolic  *float64  `json:"bloodPressureSystolic,omitempty"`
	BloodPressureDiastolic *float64  `json:"bloodPressureDiastolic,omitempty"`
	MeasurementContext     *string   `json:"measurementContext,omitempty"`
	CreatedAt              time.Time `json:"createdAt"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

type MealPlan struct {
	ID        string          `json:"id"`
	UserID    string          `json:"userId"`
	Name      string          `json:"name"`
	WeekStart string          `json:"weekStart"`
	SlotTimes json.RawMessage `json:"slotTimes,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type DayPlanEntry struct {
	ID           string    `json:"id"`
	MealPlanID   string    `json:"mealPlanId"`
	Date         string    `json:"date"`
	Slot         string    `json:"slot"`
	RecipeID     *string   `json:"recipeId,omitempty"`
	Position     int       `json:"position"`
	GroupID      *string   `json:"groupId,omitempty"`
	Servings     float64   `json:"servings"`
	IsLeftover   bool      `json:"isLeftover"`
	SourceType   string    `json:"sourceType"`
	FoodName     *string   `json:"foodName,omitempty"`
	Calories     float64   `json:"calories"`
	TotalFat     float64   `json:"totalFat"`
	SaturatedFat float64   `json:"saturatedFat"`
	TransFat     float64   `json:"transFat"`
	Cholesterol  float64   `json:"cholesterol"`
	Sodium       float64   `json:"sodium"`
	TotalCarbs   float64   `json:"totalCarbs"`
	DietaryFiber float64   `json:"dietaryFiber"`
	TotalSugars  float64   `json:"totalSugars"`
	AddedSugars  float64   `json:"addedSugars"`
	Protein      float64   `json:"protein"`
	VitaminD     float64   `json:"vitaminD"`
	Calcium      float64   `json:"calcium"`
	Iron         float64   `json:"iron"`
	Potassium    float64   `json:"potassium"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type MealGroup struct {
	ID         string    `json:"id"`
	MealPlanID string    `json:"mealPlanId"`
	Date       string    `json:"date"`
	Slot       string    `json:"slot"`
	Name       string    `json:"name"`
	Position   int       `json:"position"`
}

type RecipeBook struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	CoverColor  string    `json:"coverColor"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Chapter struct {
	ID                string    `json:"id"`
	BookID            string    `json:"bookId"`
	Title             string    `json:"title"`
	Position         int       `json:"position"`
	PageTemplateID   *string   `json:"pageTemplateId,omitempty"`
	RecipeTemplateID *string   `json:"recipeTemplateId,omitempty"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type ChapterRecipe struct {
	ID        string `json:"id"`
	ChapterID string `json:"chapterId"`
	RecipeID  string `json:"recipeId"`
	Position  int    `json:"position"`
}

type ChapterPage struct {
	ID        string    `json:"id"`
	ChapterID string    `json:"chapterId"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Category struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	ParentID  *string   `json:"parentId,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type RecipeCategory struct {
	ID         string `json:"id"`
	RecipeID   string `json:"recipeId"`
	CategoryID string `json:"categoryId"`
}

type CustomFood struct {
	ID                  string    `json:"id"`
	UserID              string    `json:"userId"`
	Name                string    `json:"name"`
	Calories            float64   `json:"calories"`
	TotalFat            float64   `json:"totalFat"`
	SaturatedFat        float64   `json:"saturatedFat"`
	TransFat            float64   `json:"transFat"`
	Cholesterol         float64   `json:"cholesterol"`
	Sodium              float64   `json:"sodium"`
	TotalCarbs          float64   `json:"totalCarbs"`
	DietaryFiber        float64   `json:"dietaryFiber"`
	TotalSugars         float64   `json:"totalSugars"`
	AddedSugars         float64   `json:"addedSugars"`
	Protein             float64   `json:"protein"`
	VitaminD            float64   `json:"vitaminD"`
	Calcium             float64   `json:"calcium"`
	Iron                float64   `json:"iron"`
	Potassium           float64   `json:"potassium"`
	SharedWithCommunity bool      `json:"sharedWithCommunity"`
	CreatedAt           time.Time `json:"createdAt"`
}

type GroceryChecklist struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	WeekStart    string    `json:"weekStart"`
	CheckedItems string    `json:"checkedItems"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type BookPage struct {
	ID        string    `json:"id"`
	BookID    string    `json:"bookId"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// BookLevelItem is one entry in a book's top-level ordering. The book level
// interleaves chapters and standalone book pages, ranked by a shared position.
type BookLevelItem struct {
	ID   string `json:"id"`
	Type string `json:"type"` // "chapter" | "book-page"
}

// ChapterItem is one entry in a chapter's ordering. A chapter interleaves its
// recipes and pages, ranked by a shared position.
type ChapterItem struct {
	Type     string `json:"type"` // "recipe" | "page"
	RecipeID string `json:"recipeId,omitempty"`
	PageID   string `json:"pageId,omitempty"`
}

type ApiKey struct {
	ID          string     `json:"id"`
	UserID      string     `json:"userId"`
	Name        string     `json:"name"`
	KeyHash     string     `json:"-"`
	KeyPrefix   string     `json:"keyPrefix"`
	Permissions string     `json:"permissions"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type SeedJob struct {
	ID          int       `json:"id"`
	DataType    string    `json:"dataType"`
	ReleaseDate string    `json:"releaseDate"`
	FileName    string    `json:"fileName"`
	RecordCount int       `json:"recordCount"`
	Status      string    `json:"status"`
	Progress    float64   `json:"progress"`
	Error       *string   `json:"error,omitempty"`
	Checkpoint  *string   `json:"checkpoint,omitempty"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

type SharedRecipe struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	RecipeID      string    `json:"recipeId"`
	ShareToken    string    `json:"shareToken"`
	Visibility    string    `json:"visibility"`
	Title         string    `json:"title"`
	Description   string    `json:"description,omitempty"`
	Category      string    `json:"category,omitempty"`
	Tags          string    `json:"tags"`
	RecipeData    string    `json:"recipeData"`
	ViewCount     int       `json:"viewCount"`
	ImportCount   int       `json:"importCount"`
	AverageRating float64   `json:"averageRating"`
	RatingCount   int       `json:"ratingCount"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type RecipeRating struct {
	ID        string    `json:"id"`
	RecipeID  string    `json:"recipeId"`
	UserID    string    `json:"userId"`
	Rating    int       `json:"rating"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type CommunityCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

// InstanceState is the single-row, instance-wide metadata exposed to clients.
// It drives first-run routing (onboarding wizard) and the registration gate.
type InstanceState struct {
	OnboardingComplete    bool       `json:"onboardingComplete"`
	OnboardingCompletedAt *time.Time `json:"onboardingCompletedAt,omitempty"`
	RegistrationEnabled   bool       `json:"registrationEnabled"`
	HasUsers              bool       `json:"hasUsers"`
	OnboardingVersion     int        `json:"onboardingVersion"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}

type UpdateRegistrationRequest struct {
	RegistrationEnabled bool `json:"registrationEnabled"`
}

type AuthResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int64  `json:"expiresIn"`
	User         User   `json:"user"`
}

type CreateRecipeRequest struct {
	Name            string                `json:"name"`
	Servings        int                   `json:"servings"`
	ServingName     string                `json:"servingName"`
	PrepTime        *string               `json:"prepTime,omitempty"`
	CookTime        *string               `json:"cookTime,omitempty"`
	Instructions    *string               `json:"instructions,omitempty"`
	LeftoverStorage *string               `json:"leftoverStorage,omitempty"`
	Ingredients     []CreateIngredientReq `json:"ingredients"`
}

type UpdateRecipeRequest struct {
	Name             *string                `json:"name,omitempty"`
	Servings         *int                   `json:"servings,omitempty"`
	ServingName      *string                `json:"servingName,omitempty"`
	PrepTime         *string                `json:"prepTime"`
	CookTime         *string                `json:"cookTime"`
	Instructions     *string                `json:"instructions"`
	LeftoverStorage  *string                `json:"leftoverStorage"`
	Ingredients      *[]CreateIngredientReq `json:"ingredients,omitempty"`
	IngredientGroups *string                `json:"ingredientGroups,omitempty"`
}

type CreateIngredientReq struct {
	FdcID            int      `json:"fdcId"`
	Name             string   `json:"name"`
	Amount           float64  `json:"amount"`
	Unit             string   `json:"unit"`
	Description      string   `json:"description"`
	Calories         float64  `json:"calories"`
	TotalFat         float64  `json:"totalFat"`
	SaturatedFat     float64  `json:"saturatedFat"`
	TransFat         float64  `json:"transFat"`
	Cholesterol      float64  `json:"cholesterol"`
	Sodium           float64  `json:"sodium"`
	TotalCarbs       float64  `json:"totalCarbs"`
	DietaryFiber     float64  `json:"dietaryFiber"`
	TotalSugars      float64  `json:"totalSugars"`
	AddedSugars      float64  `json:"addedSugars"`
	Protein          float64  `json:"protein"`
	VitaminD         float64  `json:"vitaminD"`
	Calcium          float64  `json:"calcium"`
	Iron             float64  `json:"iron"`
	Potassium        float64  `json:"potassium"`
	GroupID          *string  `json:"groupId"`
	LinkedRecipeID   *string  `json:"linkedRecipeId"`
	PrepInstructions []string `json:"prepInstructions"`
	StorageLocation  string   `json:"storageLocation"`
}

type CreateProfileRequest struct {
	Name            string   `json:"name"`
	Sex             string   `json:"sex"`
	BirthDate       *string  `json:"birthDate,omitempty"`
	HeightCm        *float64 `json:"heightCm,omitempty"`
	ActivityLevel   string   `json:"activityLevel"`
	GoalWeightKg    *float64 `json:"goalWeightKg,omitempty"`
	GoalDate        *string  `json:"goalDate,omitempty"`
	BMREquation     *string  `json:"bmrEquation,omitempty"`
	ManualBMRValue  *float64 `json:"manualBmrValue,omitempty"`
	CalorieTarget   *float64 `json:"calorieTarget,omitempty"`
	ProteinGoalG    *float64 `json:"proteinGoalG,omitempty"`
	CarbsGoalG      *float64 `json:"carbsGoalG,omitempty"`
	FatGoalG        *float64 `json:"fatGoalG,omitempty"`
	FiberGoalG      *float64 `json:"fiberGoalG,omitempty"`
	SodiumMaxMg     *float64 `json:"sodiumMaxMg,omitempty"`
	SugarMaxG       *float64 `json:"sugarMaxG,omitempty"`
	VitaminDGoalUg  *float64 `json:"vitaminDGoalUg,omitempty"`
	CalciumGoalMg   *float64 `json:"calciumGoalMg,omitempty"`
	IronGoalMg      *float64 `json:"ironGoalMg,omitempty"`
	PotassiumGoalMg *float64 `json:"potassiumGoalMg,omitempty"`
}

type CreateFoodLogRequest struct {
	ProfileID     string   `json:"profileId"`
	Date          string   `json:"date"`
	Time          *string  `json:"time,omitempty"`
	MealSlot      string   `json:"mealSlot"`
	SourceType    string   `json:"sourceType"`
	SourceID      *string  `json:"sourceId,omitempty"`
	Name          string   `json:"name"`
	Servings      float64  `json:"servings"`
	ServingAmount *float64 `json:"servingAmount,omitempty"`
	ServingUnit   *string  `json:"servingUnit,omitempty"`
	Calories      float64  `json:"calories"`
	TotalFat      float64  `json:"totalFat"`
	SaturatedFat  float64  `json:"saturatedFat"`
	TransFat      float64  `json:"transFat"`
	Cholesterol   float64  `json:"cholesterol"`
	Sodium        float64  `json:"sodium"`
	TotalCarbs    float64  `json:"totalCarbs"`
	DietaryFiber  float64  `json:"dietaryFiber"`
	TotalSugars   float64  `json:"totalSugars"`
	AddedSugars   float64  `json:"addedSugars"`
	Protein       float64  `json:"protein"`
	VitaminD      float64  `json:"vitaminD"`
	Calcium       float64  `json:"calcium"`
	Iron          float64  `json:"iron"`
	Potassium     float64  `json:"potassium"`
}

type CreateWeightEntryRequest struct {
	ProfileID              string   `json:"profileId"`
	Date                   string   `json:"date"`
	Time                   *string  `json:"time,omitempty"`
	WeightKg               float64  `json:"weightKg"`
	Notes                  *string  `json:"notes,omitempty"`
	BloodSugar             *float64 `json:"bloodSugar,omitempty"`
	BloodPressureSystolic  *float64 `json:"bloodPressureSystolic,omitempty"`
	BloodPressureDiastolic *float64 `json:"bloodPressureDiastolic,omitempty"`
	MeasurementContext     *string  `json:"measurementContext,omitempty"`
}

type CreateMealPlanRequest struct {
	Name      string          `json:"name"`
	WeekStart string          `json:"weekStart"`
	SlotTimes json.RawMessage `json:"slotTimes,omitempty"`
}

type CreateDayPlanEntryRequest struct {
	Date         string   `json:"date"`
	Slot         string   `json:"slot"`
	RecipeID     *string  `json:"recipeId,omitempty"`
	Position     int      `json:"position"`
	GroupID      *string  `json:"groupId,omitempty"`
	Servings     float64  `json:"servings"`
	IsLeftover   bool     `json:"isLeftover"`
	SourceType   string   `json:"sourceType"`
	FoodName     *string  `json:"foodName,omitempty"`
	Calories     float64  `json:"calories"`
	TotalFat     float64  `json:"totalFat"`
	SaturatedFat float64  `json:"saturatedFat"`
	TransFat     float64  `json:"transFat"`
	Cholesterol  float64  `json:"cholesterol"`
	Sodium       float64  `json:"sodium"`
	TotalCarbs   float64  `json:"totalCarbs"`
	DietaryFiber float64  `json:"dietaryFiber"`
	TotalSugars  float64  `json:"totalSugars"`
	AddedSugars  float64  `json:"addedSugars"`
	Protein      float64  `json:"protein"`
	VitaminD     float64  `json:"vitaminD"`
	Calcium      float64  `json:"calcium"`
	Iron         float64  `json:"iron"`
	Potassium    float64  `json:"potassium"`
}

type CreateBookRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	CoverColor  string `json:"coverColor"`
}

type CreateChapterRequest struct {
	Title             string  `json:"title"`
	Position          int     `json:"position"`
	PageTemplateID    *string `json:"pageTemplateId,omitempty"`
	RecipeTemplateID  *string `json:"recipeTemplateId,omitempty"`
}

type CreateCategoryRequest struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parentId,omitempty"`
}

type CreateCustomFoodRequest struct {
	Name         string  `json:"name"`
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

type ShareRecipeRequest struct {
	RecipeID    string `json:"recipeId"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Category    string `json:"category,omitempty"`
	Tags        string `json:"tags,omitempty"`
	RecipeData  string `json:"recipeData"`
	Visibility  string `json:"visibility"`
}

type RateRecipeRequest struct {
	Rating int `json:"rating"`
}

type PaginatedResponse struct {
	Data       interface{} `json:"data"`
	Total      int         `json:"total"`
	Page       int         `json:"page"`
	PerPage    int         `json:"perPage"`
	TotalPages int         `json:"totalPages"`
}

type FoodSearchResult struct {
	Foods      []FoodItem `json:"foods"`
	Total      int        `json:"total"`
	Page       int        `json:"page"`
	PerPage    int        `json:"perPage"`
	TotalPages int        `json:"totalPages"`
	Source     string     `json:"source"`
}



type Conflict struct {
	ID            string     `json:"id"`
	UserID        string     `json:"userId"`
	StoreName     string     `json:"storeName"`
	RecordID      string     `json:"recordId"`
	LocalData     string     `json:"localData"`
	RemoteData    string     `json:"remoteData"`
	LocalVersion  int        `json:"localVersion"`
	RemoteVersion int        `json:"remoteVersion"`
	Status        string     `json:"status"`
	Resolution    string     `json:"resolution,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	ResolvedAt    *time.Time `json:"resolvedAt,omitempty"`
}

type FoodStats struct {
	TotalFoods int               `json:"totalFoods"`
	ByDataType []FoodTypeCount   `json:"byDataType"`
	BySource   []FoodSourceCount `json:"bySource"`
}

type FoodTypeCount struct {
	DataType string `json:"dataType"`
	Count    int    `json:"count"`
}

type FoodSourceCount struct {
	Source string `json:"source"`
	Count  int    `json:"count"`
}

type UserSettings struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	SettingsJSON string    `json:"settings"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Template struct {
	ID         string    `json:"id"`
	UserID     *string   `json:"userId,omitempty"`
	Name       string    `json:"name"`
	Type       string    `json:"type"`
	IsDefault  bool      `json:"isDefault"`
	LayoutJSON string    `json:"layout"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type DietaryProfile struct {
	ID                      string    `json:"id"`
	UserID                  string    `json:"userId"`
	Name                    string    `json:"name"`
	AllergensJSON           string    `json:"allergens"`
	DietaryTagsJSON         string    `json:"dietaryTags"`
	NutrientThresholdsJSON  string    `json:"nutrientThresholds"`
	IsActive                bool      `json:"isActive"`
	CreatedAt               time.Time `json:"createdAt"`
	UpdatedAt               time.Time `json:"updatedAt"`
}

type AllergenRule struct {
	ID                 string    `json:"id"`
	UserID             string    `json:"userId"`
	ProfileID          string    `json:"profileId"`
	Allergen           string    `json:"allergen"`
	Severity           string    `json:"severity"`
	CustomKeywordsJSON string    `json:"customKeywords"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type BrandKit struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	Name          string    `json:"name"`
	LogoDataURL   *string   `json:"logoDataUrl,omitempty"`
	PrimaryColor  string    `json:"primaryColor"`
	SecondaryColor string   `json:"secondaryColor"`
	FontFamily    string    `json:"fontFamily"`
	Tagline       *string   `json:"tagline,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type PantryStaple struct {
	ID       string `json:"id"`
	UserID   string `json:"userId"`
	Name     string `json:"name"`
	IsGlobal bool   `json:"isGlobal"`
}

// UserListEntry is the admin-facing user summary (e.g. for picking a successor
// admin when the last admin deletes their own account).
type UserListEntry struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}

type UserLocation struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Country   string    `json:"country"`
	Region    string    `json:"region"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type SeasonalFood struct {
	ID        string `json:"id"`
	Country   string `json:"country"`
	Region    string `json:"region"`
	Month     int    `json:"month"`
	FoodsJSON string `json:"foods"`
}

type UserSecret struct {
	ID             string    `json:"id"`
	UserID         string    `json:"userId"`
	KeyName        string    `json:"keyName"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type UpdateSettingsRequest struct {
	Settings string `json:"settings"`
}

type CreateTemplateRequest struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	IsDefault bool   `json:"isDefault"`
	Layout    string `json:"layout"`
}

type UpdateTemplateRequest struct {
	Name     *string `json:"name,omitempty"`
	Layout   *string `json:"layout,omitempty"`
	IsDefault *bool  `json:"isDefault,omitempty"`
}

type CreateDietaryProfileRequest struct {
	Name                string `json:"name"`
	Allergens           string `json:"allergens"`
	DietaryTags         string `json:"dietaryTags"`
	NutrientThresholds  string `json:"nutrientThresholds"`
	IsActive            bool   `json:"isActive"`
}

type UpdateDietaryProfileRequest struct {
	Name               *string `json:"name,omitempty"`
	Allergens          *string `json:"allergens,omitempty"`
	DietaryTags        *string `json:"dietaryTags,omitempty"`
	NutrientThresholds *string `json:"nutrientThresholds,omitempty"`
	IsActive           *bool   `json:"isActive,omitempty"`
}

type CreateAllergenRuleRequest struct {
	Allergen      string `json:"allergen"`
	Severity      string `json:"severity"`
	CustomKeywords string `json:"customKeywords"`
}

type UpdateAllergenRuleRequest struct {
	Allergen       *string `json:"allergen,omitempty"`
	Severity       *string `json:"severity,omitempty"`
	CustomKeywords *string `json:"customKeywords,omitempty"`
}

type CreateBrandKitRequest struct {
	Name           string  `json:"name"`
	LogoDataURL    *string `json:"logoDataUrl,omitempty"`
	PrimaryColor   string  `json:"primaryColor"`
	SecondaryColor string  `json:"secondaryColor"`
	FontFamily     string  `json:"fontFamily"`
	Tagline        *string `json:"tagline,omitempty"`
}

type UpdateBrandKitRequest struct {
	Name           *string `json:"name,omitempty"`
	LogoDataURL    *string `json:"logoDataUrl"`
	PrimaryColor   *string `json:"primaryColor,omitempty"`
	SecondaryColor *string `json:"secondaryColor,omitempty"`
	FontFamily     *string `json:"fontFamily,omitempty"`
	Tagline        *string `json:"tagline"`
}

type CreatePantryStapleRequest struct {
	Name string `json:"name"`
}

type UpdateLocationRequest struct {
	Country string `json:"country"`
	Region  string `json:"region"`
}

type CreateSecretRequest struct {
	KeyName string `json:"keyName"`
	Value   string `json:"value"`
}

type APIResponse struct {
	OK    bool        `json:"ok"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

// RecipeCompletion: "recipe X was cooked on date Y" — one row per user +
// recipe holding the latest completion (map-overwrite semantics carried
// over from the old localStorage store).
type RecipeCompletion struct {
	UserID        string    `json:"userId"`
	RecipeID      string    `json:"recipeId"`
	CompletedDate string    `json:"completedDate"`
	CompletedAt   time.Time `json:"completedAt"`
	CompletedBy   *string   `json:"completedBy,omitempty"`
}
