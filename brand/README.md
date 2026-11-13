# NTK brand

Logo, banners, icons and the keyboard badge for NTK — Near The Keyboard. Every
file in `out/` is generated from the sources here; nothing is drawn by hand in
an image editor.

```bash
cd brand
npm install        # @resvg/resvg-js: renders SVG and turns text into outlines
node build.mjs     # writes out/ (about 0.3 MB) and lists every file
```

| Source | What it holds |
|---|---|
| `palette.json` | Every colour, light and dark, and the keyboard theme colours. `build.mjs` reads it. |
| `lib/keyboard.mjs` | The keyboard illustration: modelled in 3D in key units, projected with a one-point perspective camera onto a pixel grid. `HERO` in `build.mjs` sets the camera. |
| `lib/icons.mjs` | The keyboard at icon size, as a text pixel grid. |
| `lib/badge.mjs` | The 8-bit NTK badge, letters as text pixel grids. |
| `lib/font3x5.mjs` | The 3x5 pixel letters for the key legends of the illustration. |
| `lib/png.mjs`, `lib/raster.mjs`, `lib/svg.mjs` | PNG encoder (node:zlib), pixel canvas, SVG and text helpers. |
| `fonts/Inter-Bold.ttf` | Inter 4.1 Bold from github.com/rsms/inter, under the SIL Open Font License (`fonts/OFL.txt`). |

## Look

Objects are white, backgrounds paper, outlines and text black, and one thing
on a screen is orange: the Sign key, a verified stamp, the object that moves.
After the white rooms of "2001: A Space Odyssey": calm, a lot of white, the
black spacebar as the monolith, a round orange light on the strip as the one
eye.

| Light | Hex | Use |
|---|---|---|
| white | `#FFFFFF` | objects: keys, the keyboard body |
| paper | `#F4F4F1` | backgrounds |
| grey1 | `#D7D7D2` | first shading step: key fronts, hard shadows |
| grey2 | `#B4B4AE` | second step: recesses, gaps |
| grey3 | `#6E6E69` | secondary text only (4.6:1 on paper) |
| black | `#0A0A0A` | outlines, legends, text |
| orange | `#FF4F00` | the one active thing |
| orangeShade | `#C23C00` | the shaded face of an orange object |

| Dark | Hex | Use |
|---|---|---|
| space | `#121211` | backgrounds |
| body | `#1C1C1A` | the keyboard body, a pressed key |
| key | `#2A2A27` | keys, cards |
| edge | `#3E3E3A` | the lighter stepped edge of a key |
| rim | `#5A5A54` | outlines on space, dividers |
| muted | `#8C8C86` | secondary text only (5.5:1 on space) |
| offWhite | `#EDEDE8` | legends, text |
| black, orange, orangeShade | as light | the monolith; the one active thing |

The Android keyboard themes (TODO 3.7) take their colours from
`palette.json` → `keyboard.light` / `keyboard.dark`. A press darkens the key
face and edge by one step. The Sign key's legend is black in both themes:
black on orange is 6.0:1, white on orange only 3.3:1. Legends are 19.8:1
(light) and 12.3:1 (dark), and stay above 12:1 on a pressed key.

**Pixel rules.** One pixel grid per asset, scaled by whole numbers with nearest
neighbour. No anti-aliasing, no gradients. Shadows are one hard step of grey1
(light) or black (dark). Corners step instead of rounding. Outlines are one
pixel, black in light, rim in dark.

**Type.** Inter Bold for the wordmark and any text on the web and in the
video; the system font in the Android app. Pixel letters are only for the
badge and the tiny legends inside the illustration, never for text. In SVGs
the wordmark is outlines, so no font needs to be installed.

## Files in out/

| File | For |
|---|---|
| `logo/ntk-logo-{light,dark}.{png,svg}` | The logo, 1024 x 1024: `NEAR THE` / `KEYBOARD` over the keyboard. Reads at 48 px. |
| `banner/ntk-x-header-1500x500-*` | X header. The bottom left 400 x 200 is empty for the avatar. |
| `banner/ntk-social-1280x640-*` | GitHub social preview (upload the light PNG in Settings) and the README header. |
| `banner/ntk-poster-1600x900-*` | Video poster, with the domain. |
| `keyboard/ntk-keyboard-*` | The illustration alone, transparent: 1x grid, 4x and SVG; `small` is the icon-size keyboard. |
| `icon/ntk-avatar-400-{light,dark}.png` | X profile picture (X crops a circle; the art stays inside it). |
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
`ic_launcher_round.xml`: paper background colour, foreground, monochrome layer
for themed icons), PNGs for every density, the legacy icons for Android 7 and
older, and the badge as `drawable-nodpi/ntk_badge_light.png` and
`ntk_badge_dark.png`.

The icon art sits on 2 dp cells: 2, 3, 4, 6 and 8 pixels a cell from mdpi to
xxxhdpi, so it is sharp on every screen, and it stays inside the 66 dp safe
circle.

The badge PNGs are 12 pixels a cell, 84 px high. Shown 28 dp high on an
xxhdpi screen they are 1:1; at 14 dp, exactly half. For any other size, wrap
the PNG so Android scales it without smoothing:

```xml
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:src="@drawable/ntk_badge_light" android:filter="false" />
```

## The badge

`NTK` in chunky, slanted pixel capitals with stepped corners, then four thin
lines, the last one orange: in the manner of the maker's badge on a 1980s
synthesizer. It copies no maker's wordmark. It is the only branding on the
keyboard (top left of the strip) and the 8-bit logo wherever one is needed.
