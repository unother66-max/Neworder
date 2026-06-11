export function parseLines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );
}

export function normalizeStringArray(
  value: unknown,
  separators: RegExp = /\r?\n/
): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(separators)
      : [];

  return Array.from(
    new Set(
      values
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}
