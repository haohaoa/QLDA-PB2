import { DailyLogEntry } from '../types/undergrounding';

export function getDailyLogPhotoUrls(
  log?: Pick<DailyLogEntry, 'photoUrl' | 'photoUrls'> | null
): string[] {
  if (!log) return [];
  const photoUrls = (log.photoUrls || []).filter(
    (photoUrl): photoUrl is string => typeof photoUrl === 'string' && photoUrl.length > 0
  );
  if (log.photoUrl && !photoUrls.includes(log.photoUrl)) {
    photoUrls.unshift(log.photoUrl);
  }
  return photoUrls;
}
