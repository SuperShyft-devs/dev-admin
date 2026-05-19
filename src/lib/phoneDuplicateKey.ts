/** Last-10-digit key so +918762830757 and 8762830757 match as duplicates. */
export function phoneDuplicateKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}
