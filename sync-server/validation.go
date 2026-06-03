package main

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

func validateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("email is required")
	}
	if !strings.Contains(email, "@") || !strings.Contains(email, ".") {
		return fmt.Errorf("invalid email format")
	}
	if utf8.RuneCountInString(email) > 255 {
		return fmt.Errorf("email too long")
	}
	return nil
}

func validatePassword(password string) error {
	if utf8.RuneCountInString(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	return nil
}

func validatePagination(page, perPage int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 {
		perPage = 20
	}
	if perPage > 100 {
		perPage = 100
	}
	return page, perPage
}

func sanitizeString(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if maxLen > 0 && utf8.RuneCountInString(s) > maxLen {
		s = string([]rune(s)[:maxLen])
	}
	return s
}

func validateRequired(fields map[string]string) error {
	for name, value := range fields {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s is required", name)
		}
	}
	return nil
}
