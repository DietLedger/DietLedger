package main

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	privateKey  *rsa.PrivateKey
	publicKey   *rsa.PublicKey
	hmacSecret  []byte
	store       Store
}

func NewAuthService(store Store, signingKeyPath string) (*AuthService, error) {
	hmacSecret := os.Getenv("HMAC_SECRET")
	if hmacSecret == "" {
		hmacSecret = uuid.New().String()
		log.Println("[Auth] No HMAC_SECRET env var set, using generated secret. Tokens will not survive restarts.")
	} else {
		log.Println("[Auth] Using HMAC_SECRET from environment.")
	}
	a := &AuthService{store: store, hmacSecret: []byte(hmacSecret)}
	if signingKeyPath != "" {
		keyData, err := os.ReadFile(signingKeyPath)
		if err != nil {
			return nil, fmt.Errorf("read signing key: %w", err)
		}
		block, _ := pem.Decode(keyData)
		if block == nil {
			return nil, fmt.Errorf("decode PEM block failed")
		}
		if block.Type == "RSA PRIVATE KEY" {
			priv, err := x509.ParsePKCS1PrivateKey(block.Bytes)
			if err != nil {
				return nil, fmt.Errorf("parse private key: %w", err)
			}
			a.privateKey = priv
			a.publicKey = &priv.PublicKey
		} else if block.Type == "PUBLIC KEY" {
			pub, err := x509.ParsePKIXPublicKey(block.Bytes)
			if err != nil {
				return nil, fmt.Errorf("parse public key: %w", err)
			}
			a.publicKey = pub.(*rsa.PublicKey)
		}
	}
	if a.privateKey == nil {
		log.Println("[Auth] No RSA key provided, using HMAC HS256 with generated secret. For production, use RS256.")
	}
	return a, nil
}

func (a *AuthService) Register(email, password, displayName string) (*AuthResponse, error) {
	user, err := a.store.CreateUser(email, password, displayName)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return a.generateTokens(user)
}

func (a *AuthService) Login(email, password string) (*AuthResponse, error) {
	user, err := a.store.GetUserByEmail(email)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	if err := a.store.UpdateUserLastLogin(user.ID); err != nil {
		log.Printf("Warning: failed to update last login: %v", err)
	}
	return a.generateTokens(user)
}

func (a *AuthService) RefreshToken(refreshToken string) (*AuthResponse, error) {
	claims, err := a.parseToken(refreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}
	if claims["type"] != "refresh" {
		return nil, fmt.Errorf("not a refresh token")
	}
	userID, ok := claims["sub"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}
	user, err := a.store.GetUserByID(userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}
	return a.generateTokens(user)
}

func (a *AuthService) ValidateAccessToken(tokenString string) (string, error) {
	claims, err := a.parseToken(tokenString)
	if err != nil {
		return "", err
	}
	if claims["type"] != "access" {
		return "", fmt.Errorf("not an access token")
	}
	sub, ok := claims["sub"].(string)
	if !ok {
		return "", fmt.Errorf("invalid token claims")
	}
	return sub, nil
}

func (a *AuthService) generateTokens(user *User) (*AuthResponse, error) {
	now := time.Now()
	accessExpiry := now.Add(24 * time.Hour)
	refreshExpiry := now.Add(30 * 24 * time.Hour)

	accessClaims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"type":  "access",
		"iat":   now.Unix(),
		"exp":   accessExpiry.Unix(),
	}
	refreshClaims := jwt.MapClaims{
		"sub":   user.ID,
		"type":  "refresh",
		"iat":   now.Unix(),
		"exp":   refreshExpiry.Unix(),
	}

	accessToken, err := a.signToken(accessClaims)
	if err != nil {
		return nil, err
	}
	refreshToken, err := a.signToken(refreshClaims)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(24 * time.Hour / time.Second),
		User:         *user,
	}, nil
}

func (a *AuthService) signToken(claims jwt.MapClaims) (string, error) {
	token := jwt.NewWithClaims(a.signingMethod(), claims)
	return token.SignedString(a.signingKey())
}

func (a *AuthService) signingMethod() jwt.SigningMethod {
	if a.privateKey != nil {
		return jwt.SigningMethodRS256
	}
	return jwt.SigningMethodHS256
}

func (a *AuthService) signingKey() interface{} {
	if a.privateKey != nil {
		return a.privateKey
	}
	return a.hmacSecret
}

func (a *AuthService) parseToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if a.publicKey != nil {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return a.publicKey, nil
		}
		return a.hmacSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}
