// Authentication credentials are intentionally process-memory only.
let accessToken: string | null = null;
// Request/cache identity guard only; the Go API remains authorization authority.
// This ID comes from AuthResult.user, never decoded browser JWT claims.
let principalID: string | null = null;
let generation = 0;
export function getAccessToken(): string | null { return accessToken; }
export function setAccessToken(token: string | null, userID: string | null = null): void {
  // Preserve request isolation even when a caller uses the API client directly
  // rather than the provider's explicit retireSession() transition.
  if (principalID !== null && principalID !== userID) generation += 1;
  accessToken = token;
  principalID = token ? userID : null;
}
export function authenticatedPrincipalID(): string | null { return principalID; }
export function sessionGeneration(): number { return generation; }
export function retireSession(): void { generation += 1; accessToken = null; principalID = null; }
