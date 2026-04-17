const RGB_PATTERN = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/;
const MIN_CHANNEL_FOR_DARK_BG = 110;

export function brightenForDarkBg(rgb: string | null | undefined): string | null {
  if (!rgb) return rgb ?? null;
  const m = RGB_PATTERN.exec(rgb);
  if (!m) return rgb;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const maxChannel = Math.max(r, g, b);
  if (maxChannel >= MIN_CHANNEL_FOR_DARK_BG) return rgb;
  const lift = MIN_CHANNEL_FOR_DARK_BG - maxChannel;
  const clamp = (c: number) => Math.min(255, c + lift);
  return `${clamp(r)}, ${clamp(g)}, ${clamp(b)}`;
}
