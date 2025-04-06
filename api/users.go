package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/tg123/go-htpasswd"
)

// load passwords file for use validating passwords

func getPasswd() (*htpasswd.File, error) {
	passwdPath := os.Getenv("PASSWORDS_PATH")
	if passwdPath == "" {
		return &htpasswd.File{}, fmt.Errorf("missing PASSWORDS_PATH environment variable")
	}

	passwd, err := htpasswd.New(passwdPath, htpasswd.DefaultSystems, nil)
	if err != nil {
		return &htpasswd.File{}, err
	}

	return passwd, nil
}

// generate jwt token

func generateJwtToken(username string) (string, error) {
	issuer := os.Getenv("JWT_ISSUER")
	if issuer == "" {
		issuer = "tapes"
	}

	key := os.Getenv("JWT_KEY")
	if key == "" {
		return "", fmt.Errorf("missing JWT_KEY environment variable")
	}

	tokenLife, _ := time.ParseDuration("180m")
	token := jwt.NewWithClaims(
		jwt.SigningMethodHS256,
		jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   username,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(tokenLife)),
		},
	)

	return token.SignedString([]byte(key))
}

// parse jwt token

func parseJwtToken(tokenString string) (*jwt.Token, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		key := os.Getenv("JWT_KEY")
		if key == "" {
			return []byte(key), fmt.Errorf("missing JWT_KEY environment variable")
		}
		return []byte(key), nil
	})
	return token, err
}

// middleware to validate jwt token in auth header

func validateAuthHeader(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		headerToken := r.Header.Get("Authorization")
		headerToken = strings.Replace(headerToken, "Bearer ", "", -1)
		token, err := parseJwtToken(headerToken)

		if err != nil {
			if errors.Is(err, jwt.ErrTokenExpired) || errors.Is(err, jwt.ErrTokenNotValidYet) {
				http.Error(w, "expired token", http.StatusUnauthorized)
				return
			}

			http.Error(w, "error parsing token", http.StatusUnauthorized)
			return
		}

		if !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

// middleware to validate jwt token in url param

func validateAuthParam(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		paramToken := r.URL.Query().Get("token")
		token, err := parseJwtToken(paramToken)

		if err != nil {
			if errors.Is(err, jwt.ErrTokenExpired) || errors.Is(err, jwt.ErrTokenNotValidYet) {
				http.Error(w, "expired token", http.StatusUnauthorized)
				return
			}
			http.Error(w, "error parsing token", http.StatusUnauthorized)
			return
		}

		if !token.Valid {
			http.Error(w, "invalid authentication", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}
