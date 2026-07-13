export function forActiveProject<T extends { projectId: string }>(
  value: T | null | undefined,
  activeProjectId: string | null | undefined,
): T | null {
  if (!value || !activeProjectId || value.projectId !== activeProjectId) return null;
  return value;
}
