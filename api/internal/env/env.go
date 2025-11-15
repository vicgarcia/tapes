package env

import (
	"os"
	"strconv"
)

// GetWithDefault retrieves an environment variable or returns the default value if not set
func GetWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// GetString retrieves a string environment variable or returns the default value if not set
func GetString(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// GetInt retrieves an integer environment variable or returns the default value if not set or invalid
func GetInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
