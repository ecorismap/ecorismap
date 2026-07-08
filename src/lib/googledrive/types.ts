export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const APP_FOLDER_NAME = 'EcorisMap';
export const ECORISMAP_FILE_EXT = 'ecorismap';
export const DRIVE_SCHEMA_VERSION = '1';

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  headRevisionId?: string;
  appProperties?: Record<string, string>;
};

export type DriveProjectItem = {
  fileId: string;
  name: string;
  projectId: string;
  updatedAt: string;
  size: number;
  headRevisionId: string;
};

export type GoogleDriveAuthResult = {
  isOK: boolean;
  message: string;
  email?: string;
};

export type GoogleDriveAuthErrorReason = 'reauth-required' | 'cancelled' | 'unavailable' | 'scope-denied' | 'unknown';

export class GoogleDriveAuthError extends Error {
  reason: GoogleDriveAuthErrorReason;

  constructor(reason: GoogleDriveAuthErrorReason, message?: string) {
    super(message ?? reason);
    this.name = 'GoogleDriveAuthError';
    this.reason = reason;
  }
}

export class DriveApiError extends Error {
  status: number;
  reason: string;

  constructor(status: number, reason: string, message: string) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
    this.reason = reason;
  }
}
