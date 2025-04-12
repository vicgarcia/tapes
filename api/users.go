package main

import (
	"fmt"
	"net/http"
	"os"
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

	signedToken, err := token.SignedString([]byte(key))
	if err != nil {
		return "", fmt.Errorf("error while signing JWT token string")
	}

	return signedToken, nil
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

// handle cookies

const cookieName = "tapes"

// set cookie

func setCookie(writer http.ResponseWriter, username string) error {
	jwtToken, err := generateJwtToken(username)
	if err != nil {
		return err
	}

	http.SetCookie(writer, &http.Cookie{
		Name:     cookieName,
		Value:    jwtToken,
		Path:     "/",
		HttpOnly: false,
		Secure:   false, // Requires HTTPS
		SameSite: http.SameSiteStrictMode,
		MaxAge:   180 * 60, // 180 minutes to match token expiration
	})

	return nil
}

// delete cookie

func deleteCookie(writer http.ResponseWriter) error {
	http.SetCookie(writer, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: false,
		Secure:   false, // Requires HTTPS
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1, // Expire immediately
	})

	return nil
}

// middleware to validate jwt token in cookie

func validateAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(cookieName)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		token, err := parseJwtToken(cookie.Value)
		if err != nil || !token.Valid {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}
