const SDK_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])@anthropic-ai\/sdk(?:\/[^'"]*)?\1/;

export const findSdkImporters = (files: { path: string; content: string }[]): string[] =>
  files.filter((f) => SDK_IMPORT.test(f.content)).map((f) => f.path).sort();
