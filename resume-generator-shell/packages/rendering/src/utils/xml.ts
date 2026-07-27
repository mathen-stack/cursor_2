export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function preserveSpaceAttribute(value: string): string {
  return /^\s|\s$|\s{2,}/.test(value) ? ' xml:space="preserve"' : "";
}
