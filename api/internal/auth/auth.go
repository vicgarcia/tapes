package auth

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/tg123/go-htpasswd"
)

const cookieName = "tapes"

// GetPasswd loads the htpasswd file for password validation
func GetPasswd() (*htpasswd.File, error) {
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

// GenerateJWTToken creates a new JWT token for the given username
func GenerateJWTToken(username string) (string, error) {
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

// ParseJWTToken parses and validates a JWT token string
func ParseJWTToken(tokenString string) (*jwt.Token, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		key := os.Getenv("JWT_KEY")
		if key == "" {
			return []byte(key), fmt.Errorf("missing JWT_KEY environment variable")
		}
		return []byte(key), nil
	})
	return token, err
}

// SetCookie sets the authentication cookie with JWT token
func SetCookie(writer http.ResponseWriter, username string) error {
	jwtToken, err := GenerateJWTToken(username)
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

// DeleteCookie removes the authentication cookie
func DeleteCookie(writer http.ResponseWriter) error {
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

// ValidateAuth is middleware to validate JWT token in cookie
func ValidateAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(cookieName)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		token, err := ParseJWTToken(cookie.Value)
		if err != nil || !token.Valid {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}
