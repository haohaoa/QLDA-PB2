import { UndergroundProject } from '../types/undergrounding';

export function hasAssignedProjectContractor(
  project: Pick<UndergroundProject, 'contractors' | 'contractor'>
): boolean {
  if (project.contractors?.length) return true;

  const legacyContractor = project.contractor.trim().toLocaleLowerCase();
  return legacyContractor !== '' &&
    legacyContractor !== 'chưa phân công' &&
    legacyContractor !== 'chưa phân công nhà thầu';
}
