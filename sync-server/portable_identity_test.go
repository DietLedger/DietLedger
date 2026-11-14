package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func portableIdentity(t *testing.T, value interface{}, namespace string) string {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		t.Fatal(err)
	}
	id, _ := data["portableId"].(string)
	if !strings.HasPrefix(id, namespace) {
		t.Fatalf("portable identity = %q, want %s UUID", id, namespace)
	}
	if _, err := uuid.Parse(strings.TrimPrefix(id, namespace)); err != nil {
		t.Fatalf("portable identity %q: %v", id, err)
	}
	return id
}

func TestPortableIdentityCreationAndUpdates(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "portable")
	recipe, err := s.CreateRecipe(u.ID, &CreateRecipeRequest{Name: "Recipe", Servings: 1})
	if err != nil {
		t.Fatal(err)
	}
	recipeID := portableIdentity(t, recipe, "dietledger:recipe:")
	food, err := s.CreateCustomFood(u.ID, &CreateCustomFoodRequest{Name: "Food", Calories: 100})
	if err != nil {
		t.Fatal(err)
	}
	foodID := portableIdentity(t, food, "dietledger:food:")
	if recipeID == recipe.ID || foodID == food.ID {
		t.Fatal("portable identity must be separate from local row key")
	}
	updated, err := s.UpdateRecipe(u.ID, recipe.ID, &UpdateRecipeRequest{Name: strPtr("Edited")})
	if err != nil {
		t.Fatal(err)
	}
	if got := portableIdentity(t, updated, "dietledger:recipe:"); got != recipeID {
		t.Fatalf("recipe identity changed: %s", got)
	}
	updatedFood, err := s.UpdateCustomFood(u.ID, food.ID, &CreateCustomFoodRequest{Name: "Edited Food", Calories: 200})
	if err != nil {
		t.Fatal(err)
	}
	if got := portableIdentity(t, updatedFood, "dietledger:food:"); got != foodID {
		t.Fatalf("food identity changed: %s", got)
	}
	recipes, _, err := s.ListRecipes(u.ID, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if got := portableIdentity(t, recipes[0], "dietledger:recipe:"); got != recipeID {
		t.Fatal("list lost recipe identity")
	}
	foods, err := s.ListCustomFoods(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got := portableIdentity(t, foods[0], "dietledger:food:"); got != foodID {
		t.Fatal("list lost food identity")
	}
	if err := s.ShareCustomFood(u.ID, food.ID); err != nil {
		t.Fatal(err)
	}
	shared, _, err := s.ListSharedCustomFoods(1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if got := portableIdentity(t, shared[0], "dietledger:food:"); got != foodID {
		t.Fatal("shared listing lost food identity")
	}
}

func TestPortableIdentityDatabaseImmutabilityAndOwnerScope(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "portable-scope")
	other := createUser(t, s, "portable-other")
	r, err := s.CreateRecipe(u.ID, &CreateRecipeRequest{Name: "Original", Servings: 1})
	if err != nil {
		t.Fatal(err)
	}
	id := portableIdentity(t, r, "dietledger:recipe:")
	if _, err := s.db.Exec(`UPDATE recipes SET portable_id=$1 WHERE id=$2`, "dietledger:recipe:"+uuid.NewString(), r.ID); err == nil {
		t.Fatal("database allowed identity mutation")
	}
	if _, err := s.db.Exec(`INSERT INTO recipes (id,user_id,name,servings,portable_id) VALUES ($1,$2,'Copy',1,$3)`, uuid.NewString(), u.ID, id); err == nil {
		t.Fatal("same owner has duplicate portable identity")
	}
	if _, err := s.db.Exec(`INSERT INTO recipes (id,user_id,name,servings,portable_id) VALUES ($1,$2,'Authorized copy',1,$3)`, uuid.NewString(), other.ID, id); err != nil {
		t.Fatalf("different owner cannot retain portable identity: %v", err)
	}
	f, err := s.CreateCustomFood(u.ID, &CreateCustomFoodRequest{Name: "Original Food", Calories: 1})
	if err != nil {
		t.Fatal(err)
	}
	portableIdentity(t, f, "dietledger:food:")
	if _, err := s.db.Exec(`UPDATE custom_foods SET portable_id=$1 WHERE id=$2`, "dietledger:food:"+uuid.NewString(), f.ID); err == nil {
		t.Fatal("database allowed food identity mutation")
	}
}

func TestPortableIdentityAPIRejectsMutation(t *testing.T) {
	env := newTestEnv(t)
	for _, tt := range []struct{ path, name, namespace string }{
		{"/api/recipes", "Recipe", "dietledger:recipe:"},
		{"/api/custom-foods", "Food", "dietledger:food:"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			w := env.doRequest("POST", tt.path, map[string]interface{}{"name": tt.name, "servings": 1, "calories": 10})
			id := responseID(t, w)
			w = env.doRequest("PUT", tt.path+"/"+id, map[string]interface{}{"name": "Changed", "portableId": tt.namespace + uuid.NewString()})
			if w.Code != 400 {
				t.Fatalf("identity mutation status=%d body=%s", w.Code, w.Body.String())
			}
			w = env.doRequest("GET", tt.path+"/"+id, nil)
			// Custom-food detail has no GET endpoint, so check its owned list instead.
			if tt.path == "/api/custom-foods" {
				w = env.doRequest("GET", tt.path, nil)
			}
			if !strings.Contains(w.Body.String(), fmt.Sprintf(`"name":%q`, tt.name)) {
				t.Fatalf("rejected identity write changed content: %s", w.Body.String())
			}
		})
	}
}
