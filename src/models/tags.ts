export function modelTagMatches(selectedTag: string, installedTag: string): boolean {
  return (
    selectedTag === installedTag ||
    `${selectedTag}:latest` === installedTag ||
    selectedTag === `${installedTag}:latest`
  );
}

export function hasInstalledTag(
  installedTags: string[],
  selectedTag: string
): boolean {
  return installedTags.some((installedTag) =>
    modelTagMatches(selectedTag, installedTag)
  );
}
