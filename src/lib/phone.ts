export function normalizePhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/[^0-9]/g, "");
    const normalized = `+${digits}`;
    return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
  }

  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function maskPhoneNumber(value: string): string {
  const visible = value.slice(-4);
  return `••• ••• ${visible}`;
}
