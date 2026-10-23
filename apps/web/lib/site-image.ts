/** Where the browser loads a project's imported satellite photo; the file id busts the cache on replacement. */
export function siteImageUrl(projectId: string, fileId: string): string {
  return `/projects/${projectId}/site-image?v=${fileId}`;
}
