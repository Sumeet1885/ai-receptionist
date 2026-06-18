# Premium Widget Palettes Design

## Goal

Make widget color customization fast, coherent, and reliably readable by replacing accent-only presets with complete professional palettes.

## Experience

The Widget UI section starts with five “Quick sets.” Each card previews the header, message surface, accent, and text treatment. Selecting a card applies `theme`, `primaryColor`, `backgroundColor`, `surfaceColor`, and `textColor` together so users cannot accidentally combine unrelated preset colors.

The palettes are:

1. **Executive** — deep navy with a restrained blue accent.
2. **Graphite** — charcoal with muted gold.
3. **Porcelain** — crisp light neutrals with navy-blue action color.
4. **Evergreen** — dark forest surfaces with soft mint.
5. **Warm Sand** — warm light neutrals with a refined umber accent.

Manual controls remain available under a collapsed “Fine tune colors” section. They expose all four runtime colors, including text color, and clearly warn that selecting a quick set resets manual color changes. The old `theme` segmented control is removed because runtime presentation is controlled by the actual color tokens and the field currently does not independently style the widget.

## Readability

Accent-filled elements will no longer assume the widget background is readable on the accent. Runtime CSS will calculate a black or white `onAccent` color from the configured primary color. Muted text will be derived from the configured text color, keeping timestamps and placeholders legible across light and dark palettes.

## Compatibility

The stored `WidgetConfig` schema remains unchanged. Existing custom widgets continue to load. Presets store ordinary color values, so the server does not need to know preset IDs.

## Verification

- Unit tests verify every quick set has valid color values and acceptable text/surface contrast.
- Unit tests verify accent foreground selection for light and dark primary colors.
- Client production build and server TypeScript compilation must pass.
- The settings screen and generated widget will be visually checked after implementation.

