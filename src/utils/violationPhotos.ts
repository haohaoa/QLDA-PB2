import { ViolationReport } from '../types/undergrounding';

export const getViolationPhotoUrls = (
  violation?: Pick<ViolationReport, 'photoUrl' | 'photoUrls'> | null
): string[] => {
  if (!violation) return [];
  const photoUrls = (violation.photoUrls || []).filter(
    (url): url is string => typeof url === 'string' && Boolean(url)
  );
  if (violation.photoUrl && !photoUrls.includes(violation.photoUrl)) {
    photoUrls.push(violation.photoUrl);
  }
  return photoUrls;
};
