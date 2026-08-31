const XML_REPLACEMENTS: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** Assert that a string contains only XML 1.0 characters. */
export function assertValidXmlCharacters(value: string, label = "XML value"): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (
      codeUnit === 0x09 ||
      codeUnit === 0x0a ||
      codeUnit === 0x0d ||
      (codeUnit >= 0x20 && codeUnit <= 0xd7ff) ||
      (codeUnit >= 0xe000 && codeUnit <= 0xfffd)
    ) {
      continue;
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
    }

    throw new TypeError(`${label} contains a character that XML 1.0 cannot represent.`);
  }
}

/** Escape text for either XML text or a quoted XML attribute. */
export function escapeXml(value: string | number | boolean): string {
  const text = String(value);
  assertValidXmlCharacters(text);
  return text.replace(/[&<>"']/gu, (character) => XML_REPLACEMENTS[character] ?? character);
}
