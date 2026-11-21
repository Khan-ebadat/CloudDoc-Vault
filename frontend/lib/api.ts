import { DocumentItem, StorageMetrics, ShareRequest, ShareResponse, AuthResponse, UserSession, OpenDocumentResponse, EmailNotificationState } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const AUTH_TOKEN_KEY = 'clouddoc_auth_token';
export const AUTH_USER_KEY = 'clouddoc_auth_user';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const userJson = localStorage.getItem(AUTH_USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: UserSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function requireApiUrl(): string {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured.');
  }
  return API_BASE_URL;
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${requireApiUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Login failed (${response.status})`);
  }

  const data: AuthResponse = await response.json();
  storeSession(data.token, data.user);
  return data;
}

export async function signupUser(email: string, password: string, fullName: string): Promise<AuthResponse> {
  const response = await fetch(`${requireApiUrl()}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Signup failed (${response.status})`);
  }

  const data: AuthResponse = await response.json();
  storeSession(data.token, data.user);
  return data;
}

/**
 * Re-check this user's SNS email subscription state.
 * Returns null when notifications are unavailable or the request fails.
 */
export async function refreshNotificationStatus(): Promise<EmailNotificationState | null> {
  const token = getStoredToken();

  if (!API_BASE_URL || !token) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/notifications`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const data: { notifications?: EmailNotificationState } = await response.json();
    if (!data.notifications) return null;

    const storedUser = getStoredUser();
    if (storedUser) {
      storeSession(token, { ...storedUser, notifications: data.notifications });
    }

    return data.notifications;
  } catch {
    return null;
  }
}

export async function fetchDocuments(): Promise<{ documents: DocumentItem[]; metrics: StorageMetrics }> {
  const token = getStoredToken();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${requireApiUrl()}/documents`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.statusText}`);
  }

  return response.json();
}

export async function uploadDocument(file: File): Promise<{ message: string; document: DocumentItem }> {
  const token = getStoredToken();
  const base64Data = await fileToBase64(file);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${requireApiUrl()}/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: file.name,
      fileContentBase64: base64Data,
      contentType: file.type,
      fileSize: file.size,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Upload failed with status ${response.status}`);
  }

  return response.json();
}

export async function generateShareUrl(params: ShareRequest): Promise<ShareResponse> {
  const token = getStoredToken();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${requireApiUrl()}/documents/share`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to create pre-signed URL: ${response.status}`);
  }

  return response.json();
}

export async function deleteDocument(documentId: string): Promise<{ message: string; documentId: string }> {
  const token = getStoredToken();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${requireApiUrl()}/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Delete failed (${response.status})`);
  }

  return response.json();
}

export async function getOpenUrl(documentId: string, download = false): Promise<OpenDocumentResponse> {
  const token = getStoredToken();

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(
    `${requireApiUrl()}/documents/${encodeURIComponent(documentId)}/download${download ? '?download=1' : ''}`,
    {
      method: 'GET',
      headers,
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to open document (${response.status})`);
  }

  return response.json();
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64Only = result.split(',')[1] || result;
      resolve(base64Only);
    };
    reader.onerror = (error) => reject(error);
  });
}
