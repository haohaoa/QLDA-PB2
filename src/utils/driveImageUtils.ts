export const getGoogleDriveFileId = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.hostname !== 'drive.google.com') return null;
    const queryId = url.searchParams.get('id');
    if (queryId) return queryId;
    return url.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1] || null;
  } catch {
    return null;
  }
};

export const getImagePreviewUrl = (value: string, width = 1600): string => {
  const fileId = getGoogleDriveFileId(value);
  return fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`
    : value;
};
