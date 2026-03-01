export function validateContactName(name: string): { valid: boolean; error?: string } {
  const nameParts = name.trim().split(/\s+/);
  if (nameParts.length < 2) {
    return { valid: false, error: `Contact name must include both first and last name. Got: "${name}"` };
  }
  return { valid: true };
}
