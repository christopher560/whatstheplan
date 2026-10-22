import type { AccentColor } from "@/types.ts";

/** The vivid swatches from `dashboard-base.css`, as hex, so a chosen color can be matched to an avatar color. */
const swatches: Record<AccentColor, [number, number, number]> = {
  red: [0xff, 0x6f, 0x61],
  orange: [0xff, 0x8a, 0x2b],
  yellow: [0xff, 0xd2, 0x3f],
  green: [0x52, 0xdd, 0xb0],
  blue: [0x62, 0xbc, 0xff],
  purple: [0xab, 0x97, 0xff],
  pink: [0xff, 0x94, 0xc6],
};

/**
 * People can pick any color for their avatar, but the avatar components take one
 * of the seven accent names. This returns the closest one.
 */
export const nearestAccent = (hex: string | null | undefined): AccentColor => {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "green";
  const value = parseInt(hex.slice(1), 16);
  const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  let best: AccentColor = "green";
  let distance = Infinity;
  (Object.entries(swatches) as [AccentColor, number[]][]).forEach(([name, color]) => {
    const gap = color.reduce((sum, channel, index) => sum + (channel - rgb[index]) ** 2, 0);
    if (gap < distance) {
      distance = gap;
      best = name;
    }
  });
  return best;
};

/** The hex for an accent name, for places that store a color as hex. */
export const accentHex = (name: AccentColor): string =>
  `#${swatches[name].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
