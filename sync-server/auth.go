package main

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var ErrRegistrationDisabled = errors.New("registration is disabled")
var ErrCredentials = errors.New("invalid credentials")

const accessLifetime = 15 * time.Minute

// Precomputed bcrypt work for the unknown-account branch; no per-request salt
// generation or account-dependent outward error. Cost matches account creation.
var dummyPasswordHash, _ = bcrypt.GenerateFromPassword([]byte("not-an-account-password"), bcrypt.DefaultCost)

type AuthService struct {
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	hmacSecret []byte
	store      Store
}

func NewAuthService(store Store, signingKeyPath string) (*AuthService, error) {
	secret := os.Getenv("HMAC_SECRET")
	if !validDeploymentSecret(secret, 32) {
		return nil, errors.New("persistent strong HMAC_SECRET is required")
	}
	a := &AuthService{store: store, hmacSecret: []byte(secret)}
	if signingKeyPath != "" {
		data, err := os.ReadFile(signingKeyPath)
		if err != nil {
			return nil, errors.New("cannot read signing key")
		}
		block, _ := pem.Decode(data)
		if block == nil {
			return nil, errors.New("invalid signing key")
		}
		switch block.Type {
		case "RSA PRIVATE KEY":
			a.privateKey, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		case "PRIVATE KEY":
			var key any
			key, err = x509.ParsePKCS8PrivateKey(block.Bytes)
			if err == nil {
				var ok bool
				a.privateKey, ok = key.(*rsa.PrivateKey)
				if !ok {
					return nil, errors.New("RSA private signing key required")
				}
			}
		default:
			return nil, errors.New("RSA private signing key required")
		}
		if err != nil || a.privateKey == nil || a.privateKey.N.BitLen() < 2048 {
			return nil, errors.New("valid RSA signing key of at least 2048 bits required")
		}
		a.publicKey = &a.privateKey.PublicKey
	}
	return a, nil
}

func (a *AuthService) Register(email, password, displayName string, setupClaim ...string) (*AuthResponse, error) {
	user, err := a.store.CreateUser(email, password, displayName, setupClaim...)
	if err != nil {
		return nil, err
	}
	return a.generateTokens(user)
}

func (a *AuthService) Login(email, password string) (*AuthResponse, error) {
	user, err := a.store.GetUserByEmail(email)
	hash := dummyPasswordHash
	if err == nil && user != nil {
		hash = []byte(user.PasswordHash)
	}
	passwordErr := bcrypt.CompareHashAndPassword(hash, []byte(password))
	if err != nil {
		return nil, errors.New("authentication unavailable")
	}
	if user == nil || passwordErr != nil {
		return nil, ErrCredentials
	}
	if err := a.store.UpdateUserLastLogin(user.ID); err != nil {
		return nil, errors.New("authentication unavailable")
	}
	return a.generateTokens(user)
}

func (a *AuthService) RefreshToken(refreshToken string) (*AuthResponse, error) {
	if len(refreshToken) != 64 {
		return nil, ErrInvalidSession
	}
	next, err := sessionSecret()
	if err != nil {
		return nil, err
	}
	uid, sid, expiry, err := a.store.RotateSession(tokenHash(refreshToken), tokenHash(next))
	if err != nil {
		return nil, err
	}
	user, err := a.store.GetUserByID(uid)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrInvalidSession
	}
	return a.sessionResponse(user, sid, next, expiry)
}

func (a *AuthService) ValidateAccessToken(tokenString string) (string, error) {
	claims, err := a.parseToken(tokenString)
	if err != nil {
		return "", err
	}
	sub, ok := claims["sub"].(string)
	if !ok || sub == "" || claims["type"] != "access" {
		return "", ErrInvalidSession
	}
	sid, ok := claims["sid"].(string)
	if !ok || sid == "" || a.store == nil {
		return "", ErrInvalidSession
	}
	active, err := a.store.SessionActive(sid, sub)
	if err != nil {
		return "", err
	}
	if !active {
		return "", ErrInvalidSession
	}
	return sub, nil
}

func (a *AuthService) VerifyUserPassword(userID, password string) bool {
	if userID == "" || password == "" {
		return false
	}
	user, err := a.store.GetUserByID(userID)
	if err != nil || user == nil {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) == nil
}

func (a *AuthService) generateTokens(user *User) (*AuthResponse, error) {
	refresh, err := sessionSecret()
	if err != nil {
		return nil, err
	}
	sid := uuid.NewString()
	expiry, err := a.store.CreateSession(user.ID, sid, tokenHash(refresh))
	if err != nil {
		return nil, err
	}
	return a.sessionResponse(user, sid, refresh, expiry)
}

func (a *AuthService) sessionResponse(user *User, sid, refresh string, expiry time.Time) (*AuthResponse, error) {
	now := time.Now()
	access, err := a.signToken(jwt.MapClaims{"sub": user.ID, "sid": sid, "type": "access", "iat": now.Unix(), "exp": now.Add(accessLifetime).Unix()})
	if err != nil {
		return nil, err
	}
	return &AuthResponse{AccessToken: access, RefreshToken: refresh, RefreshExpiresAt: expiry, ExpiresIn: 900, CSRFToken: "dietledger", User: *user}, nil
}

func (a *AuthService) signToken(claims jwt.MapClaims) (string, error) {
	return jwt.NewWithClaims(a.signingMethod(), claims).SignedString(a.signingKey())
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
func (a *AuthService) parseToken(raw string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(raw, func(token *jwt.Token) (interface{}, error) {
		if a.publicKey != nil {
			return a.publicKey, nil
		}
		return a.hmacSecret, nil
	}, jwt.WithValidMethods([]string{a.signingMethod().Alg()}), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil {
		return nil, ErrInvalidSession
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidSession
	}
	return claims, nil
}

func (a *AuthService) SecretKey() []byte { return a.hmacSecret[:32] }
