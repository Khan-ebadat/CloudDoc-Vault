import { DocumentItem, StorageMetrics, ShareRequest, ShareResponse, AuthResponse, UserSession } from './types';

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

// Fallback demo documents
const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    DocumentID: 'doc_sec_8921a4',
    OwnerID: 'usr_sarah_connor',
    OwnerName: 'Sarah Connor',
    FileName: 'Q3_Financial_Audit_2026.pdf',
    FileSize: 4325376,
    ContentType: 'application/pdf',
    S3Key: 'vault/usr_sarah_connor/doc_sec_8921a4/Q3_Financial_Audit_2026.pdf',
    UploadDate: new Date(Date.now() - 3600000 * 4).toISOString(),
    Permissions: 'SHARED',
    SharedStatus: 'SHARED',
    SharedWith: [{ userId: 'usr_marcus_vance', permission: 'VIEW', sharedAt: new Date().toISOString() }],
  },
  {
    DocumentID: 'doc_sec_7730bc',
    OwnerID: 'usr_marcus_vance',
    OwnerName: 'Marcus Vance',
    FileName: 'Enterprise_Architecture_Blueprint.docx',
    FileSize: 8945664,
    ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    S3Key: 'vault/usr_marcus_vance/doc_sec_7730bc/Enterprise_Architecture_Blueprint.docx',
    UploadDate: new Date(Date.now() - 3600000 * 18).toISOString(),
    Permissions: 'PRIVATE',
    SharedStatus: 'PRIVATE',
    SharedWith: [],
  },
  {
    DocumentID: 'doc_sec_6641cd',
    OwnerID: 'usr_sarah_connor',
    OwnerName: 'Sarah Connor',
    FileName: 'K8s_Cluster_Security_Certificate.pem',
    FileSize: 24576,
    ContentType: 'text/plain',
    S3Key: 'vault/usr_sarah_connor/doc_sec_6641cd/K8s_Cluster_Security_Certificate.pem',
    UploadDate: new Date(Date.now() - 3600000 * 48).toISOString(),
    Permissions: 'PRIVATE',
    SharedStatus: 'PRIVATE',
  },
];

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  if (!API_BASE_URL) {
    // Offline simulated response
    await new Promise((res) => setTimeout(res, 600));
    const demoUser: UserSession = {
      userId: 'usr_demo_77a9b',
      email,
      fullName: email.split('@')[0].toUpperCase(),
      role: 'STANDARD_USER',
    };
    const mockToken = `demo_jwt_token_${Date.now()}`;
    storeSession(mockToken, demoUser);
    return {
      message: 'Logged in successfully (Simulated Mode)',
      token: mockToken,
      user: demoUser,
    };
  }

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
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
  if (!API_BASE_URL) {
    await new Promise((res) => setTimeout(res, 700));
    const demoUser: UserSession = {
      userId: `usr_${Math.random().toString(36).substring(2, 8)}`,
      email,
      fullName,
      role: 'STANDARD_USER',
    };
    const mockToken = `demo_jwt_token_${Date.now()}`;
    storeSession(mockToken, demoUser);
    return {
      message: 'Account created successfully (Simulated Mode)',
      token: mockToken,
      user: demoUser,
    };
  }

  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
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

export async function fetchDocuments(): Promise<{ documents: DocumentItem[]; metrics: StorageMetrics }> {
  const token = getStoredToken();

  if (!API_BASE_URL) {
    const totalSizeBytes = MOCK_DOCUMENTS.reduce((acc, doc) => acc + doc.FileSize, 0);
    return {
      documents: MOCK_DOCUMENTS,
      metrics: {
        totalFiles: MOCK_DOCUMENTS.length,
        totalSizeBytes,
        totalSizeFormatted: `${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
        allocatedQuotaBytes: 50 * 1024 * 1024 * 1024,
        usedPercentage: ((totalSizeBytes / (50 * 1024 * 1024 * 1024)) * 100).toFixed(2),
        categories: { pdf: 1, images: 0, archives: 0, documents: 1, others: 1 },
      },
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.statusText}`);
  }

  return response.json();
}

export async function uploadDocument(
  file: File,
  uploaderName?: string
): Promise<{ message: string; document: DocumentItem }> {
  const token = getStoredToken();
  const currentUser = getStoredUser();
  const base64Data = await fileToBase64(file);

  if (!API_BASE_URL) {
    await new Promise((res) => setTimeout(res, 800));
    const mockNewDoc: DocumentItem = {
      DocumentID: `doc_${Math.random().toString(36).substring(2, 9)}`,
      OwnerID: currentUser?.userId || 'usr_demo',
      OwnerName: currentUser?.fullName || uploaderName || 'Admin User',
      FileName: file.name,
      FileSize: file.size,
      ContentType: file.type || 'application/octet-stream',
      S3Key: `vault/${currentUser?.userId || 'usr_demo'}/${file.name}`,
      UploadDate: new Date().toISOString(),
      Permissions: 'PRIVATE',
      SharedStatus: 'PRIVATE',
      SharedWith: [],
    };
    return {
      message: 'Document vaulted successfully (Demo Mode)',
      document: mockNewDoc,
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/documents`, {
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

  if (!API_BASE_URL) {
    await new Promise((res) => setTimeout(res, 600));
    const simulatedS3Url = `https://clouddoc-vault-docs-demo.s3.amazonaws.com/vault/${params.documentId}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=${new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')}&X-Amz-Expires=${params.expiresIn}&X-Amz-SignedHeaders=host&X-Amz-Signature=c5847e9e73b223030311f953fa97f5f9e2bcfc6cf67f08d01168233f0d463e27`;
    return {
      message: 'Pre-signed URL generated successfully',
      documentId: params.documentId,
      fileName: 'Protected_Document.pdf',
      permission: params.permission,
      targetUserId: params.targetUserId || 'Public/Tokenized',
      httpMethod: params.permission === 'VIEW' ? 'GET' : 'PUT',
      expiresInSeconds: params.expiresIn,
      expiresAt: new Date(Date.now() + params.expiresIn * 1000).toISOString(),
      preSignedUrl: simulatedS3Url,
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/documents/share`, {
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
