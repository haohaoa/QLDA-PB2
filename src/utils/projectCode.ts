const pad = (value: number) => String(value).padStart(2, '0');

const getProjectInitials = (projectName: string): string => {
  const words = projectName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .match(/[A-Z0-9]+/g) || [];
  if (words.length === 0) return 'DA';
  return (words.length === 1 ? words[0].slice(0, 4) : words.map((word) => word[0]).join('').slice(0, 5));
};

export const generateProjectCode = (projectName: string, createdAt = new Date()): string => {
  const datePart = [
    pad(createdAt.getFullYear() % 100),
    pad(createdAt.getMonth() + 1),
    pad(createdAt.getDate()),
  ].join('');
  const timePart = [
    pad(createdAt.getHours()),
    pad(createdAt.getMinutes()),
    pad(createdAt.getSeconds()),
  ].join('');
  const uniquePart = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, '0');

  return `DA-${getProjectInitials(projectName)}-${datePart}-${timePart}-${uniquePart}`;
};
