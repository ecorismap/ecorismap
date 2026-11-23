// auth と driveApi の双方から触るため、循環 import を避けて別モジュールに置く
let appFolderId: string | undefined;

export const getCachedAppFolderId = (): string | undefined => appFolderId;

export const setCachedAppFolderId = (id: string): void => {
  appFolderId = id;
};

export function clearAppFolderCache(): void {
  appFolderId = undefined;
}
