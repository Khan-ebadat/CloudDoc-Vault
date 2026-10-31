export type PermissionType = 'VIEW' | 'EDIT' | 'WRITE';

export interface UserSession {
  userId: string;
  email: string;
  fullName: string;
  role: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: UserSession;
}

export interface SharedUserPermission {
  userId: string;
  email?: string;
  permission: PermissionType;
  sharedBy?: string;
  sharedAt: string;
}

export interface DocumentItem {
  DocumentID: string;
  OwnerID?: string;
  OwnerName?: string;
  OwnerEmail?: string;
  FileName: string;
  FileSize: number;
  ContentType: string;
  S3Key: string;
  UploaderName?: string;
  UploadDate: string;
  Permissions: string;
  SharedStatus: 'PRIVATE' | 'SHARED';
  SharedWith?: SharedUserPermission[];
  CreatedAt?: string;
  UpdatedAt?: string;
  LastSharedAt?: string;
}

export interface StorageMetrics {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  allocatedQuotaBytes: number;
  usedPercentage: string;
  categories: {
    pdf: number;
    images: number;
    archives: number;
    documents: number;
    others: number;
  };
}

export interface ShareRequest {
  documentId: string;
  permission: PermissionType;
  expiresIn: number; // in seconds
  targetUserId?: string;
}

export interface ShareResponse {
  message: string;
  documentId: string;
  fileName: string;
  permission: PermissionType;
  targetUserId?: string;
  httpMethod: 'GET' | 'PUT';
  expiresInSeconds: number;
  expiresAt: string;
  preSignedUrl: string;
}
