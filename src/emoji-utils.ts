/** Strip Unicode emoji (and variation selectors / ZWJ sequences) from a string. */
export function stripEmoji(str: string): string {
  return str
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?(\u200D[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?)*/gu, '')
    .trim();
}
