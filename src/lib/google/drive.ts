import { gfetch } from './fetcher';
import type { AuthClient } from './client';

const BASE = 'https://www.googleapis.com/drive/v3/files';

export interface DriveClient {
  /** Reparents a file (e.g. a just-created report doc) into an existing folder, out of "My Drive" root. */
  moveToFolder(fileId: string, folderId: string): Promise<void>;
}

export function createDriveClient(auth: AuthClient): DriveClient {
  return {
    async moveToFolder(fileId, folderId) {
      const url = `${BASE}/${fileId}?addParents=${encodeURIComponent(folderId)}&removeParents=root&fields=id`;
      await gfetch(auth, url, { method: 'PATCH' });
    },
  };
}
