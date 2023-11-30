export function chunkMatchesInput(chunk: any, entryFile: string) {
  const moduleIds = chunk.moduleIds || [];
  if (moduleIds.length !== 1) return;
  const moduleName: string = moduleIds[0];

  return moduleName.endsWith(entryFile);
}
