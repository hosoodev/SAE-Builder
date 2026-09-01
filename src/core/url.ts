import { domainToUnicode } from "node:url";

/**
 * Serialize a validated public URL as an IRI so internationalized hostnames
 * remain readable in generated metadata instead of being forced to Punycode.
 */
export function serializePublicUrl(value: string | URL): string {
  const url = value instanceof URL ? value : new URL(value);
  const hostname = domainToUnicode(url.hostname);
  return hostname && hostname !== url.hostname
    ? url.href.replace(url.hostname, hostname)
    : url.href;
}
