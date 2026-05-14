package main

import "time"

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"displayName"`
	PasswordHash string    `json:"-"`
	APIKey       string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Device struct {
	ID           string     `json:"id"`
	UserID       string     `json:"userId"`
	DeviceName   string     `json:"deviceName"`
	DeviceType   string     `json:"deviceType"`
	LastSyncedAt *time.Time `json:"lastSyncedAt"`
	CreatedAt    time.Time  `json:"createdAt"`
}

type SyncRecord struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	StoreName string    `json:"storeName"`
	RecordID  string    `json:"recordId"`
	Action    string    `json:"action"`
	Data      string    `json:"data"`
	Version   int       `json:"version"`
	Checksum  string    `json:"checksum"`
	Timestamp time.Time `json:"timestamp"`
	DeviceID  string    `json:"deviceId"`
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

type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
	DeviceName  string `json:"deviceName"`
	DeviceType  string `json:"deviceType"`
}

type RegisterResponse struct {
	UserID   string `json:"userId"`
	DeviceID string `json:"deviceId"`
	APIKey   string `json:"apiKey"`
}

type PushRequest struct {
	DeviceID string       `json:"deviceId"`
	Changes  []PushChange `json:"changes"`
}

type PushChange struct {
	StoreName string `json:"storeName"`
	RecordID  string `json:"recordId"`
	Action    string `json:"action"`
	Data      string `json:"data"`
	Checksum  string `json:"checksum"`
	Timestamp string `json:"timestamp"`
}

type PushResponse struct {
	Accepted      []string      `json:"accepted"`
	Conflicts     []ConflictOut `json:"conflicts"`
	ServerVersion int64         `json:"serverVersion"`
}

type ConflictOut struct {
	StoreName     string `json:"storeName"`
	RecordID      string `json:"recordId"`
	ServerData    string `json:"serverData"`
	ServerVersion int    `json:"serverVersion"`
	LocalData     string `json:"localData"`
	LocalVersion  int    `json:"localVersion"`
}

type PullResponse struct {
	Changes         []SyncRecordOut `json:"changes"`
	ServerTimestamp string          `json:"serverTimestamp"`
}

type SyncRecordOut struct {
	ID        string `json:"id"`
	StoreName string `json:"storeName"`
	RecordID  string `json:"recordId"`
	Action    string `json:"action"`
	Data      string `json:"data"`
	Version   int    `json:"version"`
	Checksum  string `json:"checksum"`
	Timestamp string `json:"timestamp"`
	DeviceID  string `json:"deviceId"`
}

type StatusResponse struct {
	LastSyncedAt     *time.Time `json:"lastSyncedAt"`
	TotalRecords     int        `json:"totalRecords"`
	Devices          []Device   `json:"devices"`
	PendingConflicts int        `json:"pendingConflicts"`
}

type FullDumpRequest struct {
	DeviceID string                    `json:"deviceId"`
	Data     map[string][]SyncRecordOut `json:"data"`
}

type FullDumpResponse struct {
	Data            map[string][]SyncRecordOut `json:"data"`
	ServerTimestamp string                     `json:"serverTimestamp"`
}

type ResolveConflictRequest struct {
	Resolution string `json:"resolution"`
	Data       string `json:"data,omitempty"`
}
