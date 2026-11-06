/** Best-effort contact minimization, not anonymization. Names/addresses may remain.
 * Always show the preview and let the user remove unnecessary personal details. */
export function prepareAiText(text: string): string {
  return text.replace(/\r\n?/gu, "\n")
    .replace(/(?<![\p{L}\d._%+-])[\p{L}\d._%+-]{1,64}@[\p{L}\d.-]{1,253}\.[\p{L}]{2,63}/gu, "[email removed]")
    .replace(/https?:\/\/[^\s]+|\b(?:www\.|linkedin\.com\/)[^\s]+/giu, "[link removed]")
    .replace(/(?:\+?\d[\d ().-]{6,}\d)/gu, value => {
      const digits = value.replace(/\D/gu, "").length;
      // Do not consume ordinary year ranges as contact numbers.
      return digits >= 10 && digits <= 15 ? "[phone removed]" : value;
    }).trim();
}
