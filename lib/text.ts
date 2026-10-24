/** LinkedIn Posts API commentary is "little text": these characters must be backslash-escaped. */
export function escapeLittleText(text: string) {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
}
