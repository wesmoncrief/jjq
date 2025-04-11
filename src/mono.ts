// This works for the SF font on my macbook
export const Mono = {
  hair: " ",
  w: `               `, // hair spaces

  horizontal: "─", // U+2500
  vertical: "┃", // U+2503

  cornerTopLeft: "┌", // U+250C
  cornerTopRight: "┐", // U+2510
  cornerBottomLeft: "└", // U+2514
  cornerBottomRight: "┘", // U+2518

  train1: "┬", // U+252C
  train2: "┴", // U+2534
  train3: "├", // U+251C
  train4: "┤", // U+2524
  train5: "┼", // U+253C

  diamond: "◆", // U+25C6 (Black Diamond)
  dot: "● ", // U+25CF plus hair space
  hollowDot: "○ ", // U+25CB plus hair space

  // hollowTracedDot: "◌ ", // U+25CC plus hair space
  darkGrey: "▓", // U+2593 (Dark Shade)

  // includes hairs
  tilde: " ~  ", // U+2593 (Dark Shade)
  at: " @",
  x: "    x",
};

export const MONO_MAP: { [key: string]: string } = {
  " ": Mono.w,
  "─": Mono.horizontal,
  "│": Mono.vertical,
  "╮": Mono.cornerTopRight,
  "╯": Mono.cornerBottomRight,
  "╰": Mono.cornerBottomLeft,
  "╭": Mono.cornerTopLeft,
  "-": Mono.horizontal,
  "|": Mono.vertical,
  "├": Mono.train3,
  "┤": Mono.train4,
  "┬": Mono.train1,
  "┴": Mono.train2,
  "┼": Mono.train5,
  "○": Mono.hollowDot,
  "●": Mono.dot,
  "◆": Mono.diamond,
  "~": Mono.tilde,
  "@": Mono.at,
  "x": Mono.x,
};
