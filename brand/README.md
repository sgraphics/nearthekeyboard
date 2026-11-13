# NTK brand

Logo, banners, icons and the keyboard badge for NTK — Near The Keyboard. Every
file in `out/` is generated from the sources here; nothing is drawn by hand in
an image editor.

```bash
cd brand
npm install        # @resvg/resvg-js: renders SVG and turns text into outlines
node build.mjs     # writes out/ (about 4 MB) and lists every file
```

| Source | What it holds |
|---|---|
| `palette.json` | Every colour, light and dark, the gold, the icon colours, and the shared values for the keyboard app. `build.mjs` reads it. |
| `lib/keyboard.mjs` | The keyboard illustration, a smooth 3D drawing in SVG: the hero (`MODELS.full`), the icon keyboard (`MODELS.small`) and the favicon one (`MODELS.tiny`). |
| `lib/badge.mjs` | The NTK mark: N, T and K as two parallel lines, built from centerlines as vector shapes (polygons and arcs); writes the SVG and the Android VectorDrawables. |
| `lib/svg.mjs`, `lib/png.mjs` | Text as outlines and SVG rendering (resvg); a PNG encoder (node:zlib). |
| `fonts/Inter-Bold.ttf`, `fonts/Inter-Light.ttf` | Inter 4.1 Bold and Light from github.com/rsms/inter, under the SIL Open Font License (`fonts/OFL.txt`). |

## Look

A keyboard as if Polestar had made it; the high-key white of Mirror's Edge.
Matte white surfaces with rounded corners and no outlines, thin dark seams
between tiles, soft layered blurred shadows, dark glass for displays, and
three accents: orange, brushed gold and black. The background is a soft
studio light, white where the keyboard stands and falling off to a cool grey;
no grid. Light comes from above, behind and to the left, so shadows fall
towards the front right.

**The keyboard.** A compact keyboard (five rows, 15 units) seen from the
front left and above. A white body with softly rounded edges; matte white
tiles, each with a rounded edge, standing a little proud of the deck with thin
dark seams between them; thin engraved icons on Tab, Shift, Backspace and
Enter, the letter keys blank; an orange Enter key. On the strip at the back:
a dark glass display with a typing rhythm in thin bars (one in orange), a
round orange status light with a soft glow, and a knurled gold knob at the top
right in an engraved ring, casting a soft shadow. The dark version is the same
keyboard in graphite, with a line of light along its edges.

How it is drawn (`lib/keyboard.mjs`): the keyboard is modelled in
millimetres (a key unit is 19.05 mm) and drawn in an orthographic
three-quarter view (`CAMERA`: turned 22°, looking down at 46°), so every flat
face is an exact projection and a rounded corner is an elliptical arc. The
body's walls are thin horizontal slices from the floor up, each shaded by the
way its wall faces and how far the rounded top and bottom edges have turned,
so the shading follows the corners. The floor shadow is the footprint blurred
in four layers (`SHADOW_LAYERS`), from a tight contact shadow to a wide soft
one. The knob is a cylinder with metal bands, a lattice of small pyramids for
the knurling, a polished chamfer and a brushed top with a soft sheen.
`MODELS.small` (three rows, six units) is the icon keyboard; `MODELS.tiny`
(two rows, a plain knob, a steeper view) is for the 32 px favicon. On the
orange icon tile the Enter key is black, so it does not read as a hole.

| Light | Hex | Use |
|---|---|---|
| studio, studioEdge | `#FFFFFF` `#E9EBEF` | backgrounds: the studio light, centre to edges |
| white, deck | `#FFFFFF` `#F3F4F7` | the deck, from the back left to the front right |
| white, tile | `#FFFFFF` `#F5F6F8` | tile tops, the same way |
| tileEdge | `#DCDFE4` | the rounded front and right edge of a tile |
| wallShade | `#BCC2CB` | the body's walls at their darkest (they run from white) |
| backEdge | `#E2E5EA` | the rounded back edge, so the outline holds on a white page |
| seam | `#2A2E35` | thin seams between tiles; engraved lines |
| tileWall | `#3A3F47` | the tiles' sides, seen in the seams |
| legend | `#4A4F57` | engraved icons on white tiles |
| ink | `#111318` | the wordmark, text, black details (18:1 on white) |
| muted | `#6B7280` | secondary text only (4.8:1 on white) |
| display, displayDeep | `#23262C` `#16181C` | dark glass |
| tick | `#A3A9B2` | thin lines on dark glass |
| orange | `#FF4F00` | accents: the Enter (Sign) key, the status light, the main action, a verified stamp; the icon tile |
| orangeLit, orangeEdgeLit, orangeEdge, orangeWall | `#FF6418` `#FF8F57` `#C83E00` `#6B2300` | the orange tile's top, lit edge, shaded edge, sides |
| shadow | `#1B2230` | soft shadows, in layers of 8 to 55 % opacity |

| Dark | Hex | Use |
|---|---|---|
| studio, studioEdge | `#23262C` `#111318` | backgrounds |
| deck, deckFar | `#2C3036` `#23262B` | the deck |
| tile, tileFar | `#3A3E46` `#30343A` | tile tops |
| tileEdgeLit, tileEdge | `#50555E` `#202328` | a tile's lit and shaded edges |
| wallLight, wallShade, rim, backEdge | `#4A4F58` `#16181C` `#6A707A` `#646A74` | the body's walls and the light along its edges |
| seam, tileWall | `#0E0F12` `#0B0C0E` | seams |
| offWhite | `#F5F6F8` | the wordmark, text (14:1 on the studio) |
| muted | `#9CA3AF` | secondary text only (6:1 on the studio) |
| display, displayDeep | `#16181C` `#0B0C0E` | dark glass |
| shadow | `#000000` | soft shadows |
| orange | as light | the same orange |

| Gold (both) | Hex | Use |
|---|---|---|
| spec, light, mid, dark, deep | `#FFF3CC` `#E4C77A` `#CBA74F` `#B8902F` `#6F5316` | brushed gold, from the highlight to the darkest reflection |
| shadow | `#3B2A06` | the shaded facets of the knurling |

The keyboard app and the site are drawn in the same look; `palette.json` →
`keyboard.light` / `keyboard.dark` holds the shared values (white tiles, dark
seams, the dark display, the orange Sign key with an `#111318` legend, 5:1,
and the gold). What the app ships is in its `res/values{,-night}/colors-ntk.xml`.

**Type.** Inter Bold for the wordmark, in ink `#111318` on light and
off-white on dark; Inter Light, widely tracked, for small lines such as the
domain on the poster; the system font in the Android app. The NTK mark is
drawn, not set in a font. In SVGs all text is outlines, so no font needs to be
installed.

## Files in out/

| File | For |
|---|---|
| `logo/ntk-logo-{light,dark}.{png,svg}` | The logo, 1024 x 1024: `NEAR THE` / `KEYBOARD` over the keyboard, on the studio background. |
| `banner/ntk-x-header-1500x500-*` | X header. The bottom left 400 x 200 is empty for the avatar. |
| `banner/ntk-social-1280x640-*` | GitHub social preview (upload the light PNG in Settings) and the README header. |
| `banner/ntk-poster-1600x900-*` | Video poster, with the domain. |
| `keyboard/ntk-keyboard-{light,dark}.svg`, `-4x.png` | The illustration alone, 856 x 512, transparent, with its floor shadow: the site's hero. `dark` is the graphite keyboard, for dark pages. |
| `keyboard/ntk-keyboard-{light,dark}-1x.png` | The same, 182 x 94. |
| `keyboard/ntk-keyboard-small-*` | The icon keyboard, 62 x 33 and 496 x 264, transparent. |
| `icon/ntk-avatar-400-{light,dark}.png` | X profile picture: the white or the graphite keyboard on orange (X crops a circle; the keyboard stays inside it). |
| `icon/ntk-icon-512.png` | Store and legacy 512 icon, full bleed. |
| `icon/favicon.ico`, `favicon-32.png`, `apple-touch-icon-180.png` | Web. |
| `android/` | Ready-to-copy resources, see below. |
| `badge/ntk-badge-{light,dark}.svg`, `-{32,64,128,256}.png` | The NTK mark, 320 x 100: SVG with the gaps cut out by a mask (they show what lies behind), and smooth PNGs 32 to 256 px tall, transparent. `light` is for light backgrounds, `dark` for dark ones; both are the same orange today. |

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

The icon is drawn in dp on the 108 dp adaptive canvas and rendered for each
density (108 px at mdpi to 432 px at xxxhdpi). The keyboard is 60 dp wide and
stays inside the 66 dp safe circle; it reads at 48 dp on its orange
background, with a soft deep-orange shadow. The legacy icons are the middle
72 dp, filling 48 dp, as a rounded square and a circle. The monochrome layer
is the keyboard as one white shape with the seams and the black key cut out.

The badge drawables are VectorDrawables, 76.8 x 24 dp, and stay smooth at any
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
run into each other like roads at a junction. Round the N's elbows both lines
curve about the same centre, like the bowl of a drawn R.

- Proportions: cap height 100, lines t = 8 (8 % of the cap height), gap
  g = 11.2 (1.4 t), letters 15 apart. The mark is 320 x 100 (3.2:1).
- N: one double line that zig-zags, open at the foot of the left stem and at
  the top of the right one. Its two elbows are round: arcs of radius 18 on the
  centerline (the inner line 4.4 to 12.4, the outer 23.6 to 31.6), touching
  the cap line and the baseline; the diagonal is their common tangent.
- T: the bar, open at both ends; the stem, open at the foot, its gap running
  into the bar's.
- K: the stem, open at both ends; arm and leg leave the middle of its gap and
  end level with the cap line and the baseline.
- The N's elbows are round, every other corner square; open ends are cut
  square: across the line, or level with the cap line or the baseline.
  Upright, no slant, no extra stripes.
- Orange `#FF4F00` on light and dark: about 3:1 on a near-white strip, 5.7:1
  on a near-black one. It reads at 20 px tall in the site's header and at
  24 dp on the keyboard strip.

It is the only branding on the keyboard (top left of the strip, 24 dp tall)
and the logo in the site's page headers. The keyboard illustration does not
carry it: on the illustration's strip it would be a few pixels tall, too small
for its lines to resolve.
