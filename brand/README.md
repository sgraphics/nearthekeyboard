# NTK brand

Logo, banners, icons and the keyboard badge for NTK — Near The Keyboard. Every
file in `out/` is generated from the sources here; nothing is drawn by hand in
an image editor.

```bash
cd brand
npm install        # @resvg/resvg-js: renders SVG and turns text into outlines
node build.mjs     # writes out/ (about 0.25 MB) and lists every file
```

| Source | What it holds |
|---|---|
| `palette.json` | Every colour, light and dark, and the keyboard theme colours. `build.mjs` reads it. |
| `lib/keyboard.mjs` | The keyboard in 2:1 pixel isometric, built from blocks: the hero illustration (`KEYBOARD_DEFAULTS`), the icon keyboard (`SMALL`) and the favicon one (`FAVICON`). |
| `lib/font3x5.mjs` | 3x5 pixel letters, available for key legends (`legends: 'glyph'`); the keys use dark marks at the sizes we ship. |
| `lib/badge.mjs` | The 8-bit NTK badge, letters as text pixel grids. |
| `lib/png.mjs`, `lib/raster.mjs`, `lib/svg.mjs` | PNG encoder (node:zlib), pixel canvas, SVG and text helpers. |
| `fonts/Inter-Bold.ttf` | Inter 4.1 Bold from github.com/rsms/inter, under the SIL Open Font License (`fonts/OFL.txt`). |

## Look

Isometric 3D pixels, light and blocky, a little like Minecraft. The keyboard
lies on the desk, seen from above at an angle, in classic 2:1 pixel isometric
(edges step two pixels across for one down). Every object is a block: a light
top face, a lit front face, a shaded right face. There are no outlines; an
edge is where one face meets another. Shadows are soft and blocky, one light
step darker than what they fall on. Orange marks the accents: the Enter (Sign) key, the light on the
strip, a verified stamp, and the icon background. One dark block, the
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
Shadows are one soft step.

**Type.** Inter Bold for the wordmark and any text on the web and in the
video, in ink `#2B2B2B` (offWhite on dark); the system font in the Android
app. Pixel letters are only for the badge, never for text. In SVGs the
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
| `badge/ntk-badge-{light,dark}-{1,4,8,16}x.png`, `.svg` | The 8-bit NTK badge. `light` = for light backgrounds (dark marks), `dark` = for dark backgrounds (light marks). |

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
`drawable-nodpi/ntk_badge_light.png` and `ntk_badge_dark.png`.

The icon art sits on 1 dp cells (108 across): 1, 2, 3 and 4 whole pixels a
cell at mdpi, xhdpi, xxhdpi and xxxhdpi; hdpi is sampled nearest-neighbour, so
it stays hard-edged. The keyboard stays inside the 66 dp safe circle and reads
at 48 dp on its orange background.

The badge PNGs are 12 pixels a cell, 96 px high. Shown 32 dp high on an
xxhdpi screen they are 1:1; at 16 dp, exactly half. For any other size, wrap
the PNG so Android scales it without smoothing:

```xml
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:src="@drawable/ntk_badge_light" android:filter="false" />
```

## The badge

`NTK` in chunky, slanted pixel capitals with stepped corners, standing out as
blocks with a soft drop, then four thin flat lines, the last one orange: in the
manner of the maker's badge on a 1980s synthesizer. It copies no maker's
wordmark. It is the only branding on the keyboard (top left of the strip) and
the 8-bit logo wherever one is needed.
