export const BUTTON_SHAPES = ["pill", "rounded", "square"] as const;
export const BUTTON_FILLS = ["solid", "outline"] as const;

export type ButtonShape = (typeof BUTTON_SHAPES)[number];
export type ButtonFill = (typeof BUTTON_FILLS)[number];

const RADIUS = {
  pill: "9999px",
  rounded: "0.75rem",
  square: "0.25rem",
} as const satisfies Record<ButtonShape, string>;

export function buttonRadius(shape: ButtonShape | undefined) {
  return RADIUS[shape ?? "pill"];
}
