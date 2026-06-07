package main

import (
	"testing"
)

func TestValidateEmail(t *testing.T) {
	tests := []struct {
		name    string
		email   string
		wantErr bool
	}{
		{"valid", "user@example.com", false},
		{"valid with subdomain", "user@mail.example.com", false},
		{"empty", "", true},
		{"missing at", "userexample.com", true},
		{"missing dot", "user@example", true},
		{"missing both", "userexample", true},
		{"too long", string(make([]byte, 256)), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateEmail(tt.email)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateEmail(%q) error = %v, wantErr %v", tt.email, err, tt.wantErr)
			}
		})
	}
}

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"valid", "password123", false},
		{"exactly 8", "12345678", false},
		{"too short", "1234567", true},
		{"empty", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePassword(tt.password)
			if (err != nil) != tt.wantErr {
				t.Errorf("validatePassword(%q) error = %v, wantErr %v", tt.password, err, tt.wantErr)
			}
		})
	}
}

func TestValidatePagination(t *testing.T) {
	tests := []struct {
		name         string
		page, perPage int
		wantPage, wantPerPage int
	}{
		{"valid", 2, 50, 2, 50},
		{"zero page", 0, 20, 1, 20},
		{"negative page", -1, 20, 1, 20},
		{"zero perPage", 1, 0, 1, 20},
		{"negative perPage", 1, -5, 1, 20},
		{"perPage over 100", 1, 200, 1, 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotPage, gotPerPage := validatePagination(tt.page, tt.perPage)
			if gotPage != tt.wantPage || gotPerPage != tt.wantPerPage {
				t.Errorf("validatePagination(%d, %d) = (%d, %d), want (%d, %d)",
					tt.page, tt.perPage, gotPage, gotPerPage, tt.wantPage, tt.wantPerPage)
			}
		})
	}
}

func TestSanitizeString(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		maxLen int
		want   string
	}{
		{"no trim needed", "hello", 0, "hello"},
		{"trims spaces", "  hello  ", 0, "hello"},
		{"truncates", "hello world", 5, "hello"},
		{"no truncation when under max", "hi", 10, "hi"},
		{"exactly max len", "hello", 5, "hello"},
		{"zero maxLen means no truncation", "hello world", 0, "hello world"},
		{"empty after trim", "   ", 0, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeString(tt.input, tt.maxLen)
			if got != tt.want {
				t.Errorf("sanitizeString(%q, %d) = %q, want %q", tt.input, tt.maxLen, got, tt.want)
			}
		})
	}
}

func TestValidateRequired(t *testing.T) {
	tests := []struct {
		name    string
		fields  map[string]string
		wantErr bool
	}{
		{"all present", map[string]string{"name": "Alice", "email": "a@b.com"}, false},
		{"one empty", map[string]string{"name": "", "email": "a@b.com"}, true},
		{"one whitespace", map[string]string{"name": "  ", "email": "a@b.com"}, true},
		{"empty map", map[string]string{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRequired(tt.fields)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateRequired() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
