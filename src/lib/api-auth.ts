export function getApiAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('dietledger_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
