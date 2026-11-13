# NTK brand

Logo, banners, icons and the keyboard badge for NTK — Near The Keyboard. Every
file in `out/` is generated from the sources here; nothing is drawn by hand in
an image editor.

```bash
cd brand
npm install        # @resvg/resvg-js: renders SVG and turns text into outlines
node build.mjs     # writes out/ (about 0.4 MB) and lists every file
```

| Source | What it holds |
|---|---|
| `palette.json` | Every colour, light and dark, and the keyboard theme colours. `build.mjs` reads it. |
| `lib/keyboard.mjs` | The keyboard in 2:1 pixel isometric, built from blocks: the hero illustration (`KEYBOARD_DEFAULTS`), the icon keyboard (`SMALL`) and the favicon one (`FAVICON`). |
| `lib/font3x5.mjs` | 3x5 pixel letters, available for key legends (`legends: 'glyph'`); the keys use dark marks at the sizes we ship. |
| `lib/badge.mjs` | The NTK mark: N, T and K as two parallel lines, built from centerlines as vector shapes; writes the SVG and the Android VectorDrawables. |
| `lib/png.mjs`, `lib/raster.mjs`, `lib/svg.mjs` | PNG encoder (node:zlib), pixel canvas, SVG and text helpers. |
| `fonts/Inter-Bold.ttf` | Inter 4.1 Bold from github.com/rsms/inter, under the SIL Open Font License (`fonts/OFL.txt`). |

## Look

Isometric 3D pixels, light and blocky, a little like Minecraft. The keyboard
lies on the desk, seen from above at an angle, in classic 2:1 pixel isometric
(edges step two pixels across for one down). Every object is a block: a light
top face, a lit front face, a shaded right face. There are no outlines; an
edge is where one face meets another. Shadows are soft and blocky, one light
step darker than what they fall on. Orange marks the accents: the Enter (Sign) key, the light on the
strip, a verified stamp, the icon background, and the NTK mark. One dark block, the
spacebar, is the monolith of "2001: A Space Odyssey" in soft grey.

| Light | Hex | Use |
|---|---|---|
| white | `#FFFFFF` | top faces of keys and small blocks |
| top | `#F7F7F4` | top faces of large blocks: the keyboard body, cards |
| lit | `#E9E9E4` | lit side faces (front) |
| shade | `#DADAD3` | shaded side faces (right) |
| paper | `#EDEDE8` | backgrounds |
| drop | `#DDDDD6` | soft drops on paper |
| ink | `#2B2B2B` | the wordmark, text, legends (12:1 on paper) |
| muted | `#66665F` | secondary text only (4.9:1 on paper) |
| slate, slateLit, slateShade | `#4A4A46` `#3B3B38` `#30302E` | the one dark block |
| orange, orangeLit, orangeShade | `#FF4F00` `#E04600` `#C23D00` | orange blocks: top, lit side, shaded side |

| Dark | Hex | Use |
|---|---|---|
| space | `#121211` | backgrounds |
| drop | `#0A0A09` | soft drops on space |
| top, lit, shade | `#222220` `#3A3A36` `#2E2E2B` | large blocks: the side faces are lighter than the top |
| key, keyLit, keyShade | `#2E2E2B` `#4A4A45` `#3D3D39` | keys |
| offWhite | `#EDEDE8` | the wordmark, text, legends (16:1 on space) |
| muted | `#8C8C86` | secondary text only (5.5:1 on space) |
| slate, slateLit, slateShade | `#161615` `#2A2A27` `#222220` | the one dark block |
| orange, orangeLit, orangeShade | as light | the same orange |

The Android keyboard themes (TODO 3.7) take their colours from
`palette.json` → `keyboard.light` / `keyboard.dark`: each key is a block (face,
lit edge below, shaded edge at the right, no outline), and a press darkens the
face and both edges by one step. Legends are 14:1 on a light key and 11.6:1 on
a dark one. The Sign key is an orange block with a `#1A1A1A` legend (5.3:1;
`#2B2B2B` would be 4.3:1, white 3.3:1).

**Pixel rules.** One pixel grid per asset, scaled by whole numbers with nearest
neighbour (5 px a pixel in the logo). Isometric lines step two across for one
down. No anti-aliasing, no gradients, no outlines. Every block shows three
faces: top, lit front, shaded right. Legends are dark marks on the key tops.
Shadows are one soft step. The one exception is the NTK mark (see The badge):
smooth vector lines, never put on the pixel grid.

**Type.** Inter Bold for the wordmark and any text on the web and in the
video, in ink `#2B2B2B` (offWhite on dark); the system font in the Android
app. Pixel letters are only for key legends in the illustration, never for text;
the NTK mark is drawn, not set in a font. In SVGs the
wordmark is outlines, so no font needs to be installed.

## Files in out/

| File | For |
|---|---|
| `logo/ntk-logo-{light,dark}.{png,svg}` | The logo, 1024 x 1024: `NEAR THE` / `KEYBOARD` over the keyboard. Reads at 48 px. |
| `banner/ntk-x-header-1500x500-*` | X header. The bottom left 400 x 200 is empty for the avatar. |
| `banner/ntk-social-1280x640-*` | GitHub social preview (upload the light PNG in Settings) and the README header. |
| `banner/ntk-poster-1600x900-*` | Video poster, with the domain. |
| `keyboard/ntk-keyboard-*` | The illustration alone, transparent: 1x grid, 4x and SVG; `small` is the icon keyboard. |
| `icon/ntk-avatar-400-{light,dark}.png` | X profile picture: the white or the charcoal keyboard on orange (X crops a circle; the art stays inside it). |
| `icon/ntk-icon-512.png` | Store and legacy 512 icon, full bleed. |
| `icon/favicon.ico`, `favicon-32.png`, `apple-touch-icon-180.png` | Web. |
| `android/` | Ready-to-copy resources, see below. |
| `badge/ntk-badge-{light,dark}.svg`, `-{32,64,128,256}.png` | The NTK mark, 300 x 100: SVG with the gaps cut out by a mask (they show what lies behind), and smooth PNGs 32 to 256 px tall, transparent. `light` is for light backgrounds, `dark` for dark ones; both are the same orange today. |

README header with a dark-mode switch:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/out/banner/ntk-social-1280x640-dark.png">
  <img alt="Near The Keyboard" src="brand/out/banner/ntk-social-1280x640-light.png">
</picture>
```

Web head:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
```

## Android

Copy the folders in `out/android/` into the app's `src/main/res/`. They hold the
adaptive launcher icon (`mipmap-anydpi-v26/ic_launcher.xml` and
`ic_launcher_round.xml`: orange background colour, the white keyboard as
foreground, a monochrome layer for themed icons), PNGs for every density, the
legacy icons for Android 7 and older, and the badge as
`drawable/ntk_badge_light.xml` and `ntk_badge_dark.xml`.

The icon art sits on 1 dp cells (108 across): 1, 2, 3 and 4 whole pixels a
cell at mdpi, xhdpi, xxhdpi and xxxhdpi; hdpi is sampled nearest-neighbour, so
it stays hard-edged. The keyboard stays inside the 66 dp safe circle and reads
at 48 dp on its orange background.

The badge drawables are VectorDrawables, 72 x 24 dp, and stay smooth at any
size. VectorDrawable has no masks, so each paints the orange lines and then
the gaps between them in the background of the strip it sits on:
`ntk_background`, which `build.mjs` reads from the app's
`res/values/colors-ntk.xml` (light) and `res/values-night/colors-ntk.xml`
(dark). Draw each only on that colour, and rebuild when it changes. The app
picks the one for the current theme (`ui/BadgeView`).

## The badge

`NTK`, each letter drawn as two parallel orange lines of equal thickness with
an even gap between them, in the manner of a synthesizer maker's double-line
mark. The letters are our own; the mark copies no maker's mark or wordmark.

Each letter is a few strokes along centerlines (`lib/badge.mjs`). A stroke is
a wide band, 2t + g across, with a gap g cut along its middle: the mark is the
union of the bands minus the union of the gaps. Where strokes meet, their gaps
run into each other like roads at a junction.

- Proportions: cap height 100, lines t = 8 (8 % of the cap height), gap
  g = 11.2 (1.4 t), letters 15 apart. The mark is 300 x 100, exactly 3:1.
- N: one double line that zig-zags, open at the foot of the left stem and at
  the top of the right one. Its two acute corners are cut flat at the cap line
  and the baseline, so the outer line turns them at its own thickness.
- T: the bar, open at both ends; the stem, open at the foot, its gap running
  into the bar's.
- K: the stem, open at both ends; arm and leg leave the middle of its gap and
  end level with the cap line and the baseline.
- Corners are square, open ends are cut square: across the line, or level with
  the cap line or the baseline. Upright, no slant, no extra stripes.
- Orange `#FF4F00` on light and dark: 3:1 on the light strip (`#F4F4F1`),
  5.7:1 on the dark one (`#121211`). It reads at 20 px tall in the site's
  header and at 24 dp on the keyboard strip.

It is the only branding on the keyboard (top left of the strip, 24 dp tall)
and the logo in the site's page headers. The pixel keyboard does not carry
it: at the strip's few pixels the lines do not resolve, so the illustration's
strip keeps only its orange light.
