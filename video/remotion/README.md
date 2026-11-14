# NTK launch video (Remotion)

The launch video for NTK as an editable project: React + TypeScript with
[Remotion](https://www.remotion.dev). Every scene is a component and every
element a layer; all timings, captions, clip cuts and story values are in one
config file, `src/timeline.tsx`. 1920 × 1080, 30 fps, H.264, captions burned in,
plus an `.srt`.

## Edit and render

Needs Node 20 or later. Run everything from this folder (`video/remotion`).

```bash
npm install          # once; node_modules stays out of git
npm run studio       # preview and edit at http://localhost:3000
npm run render       # ../out/ntk-launch.mp4 and ../out/ntk-launch.srt
npm run srt          # only the .srt, from the same config
npm run typecheck
```

`video/out/` is not committed.

In Studio, pick the composition **Launch**. The **Props** panel on the right
lists every setting: `look` (colours, caption size and weight), `story` (the
account, the reply, the stamp id and score, the links), `fwd` (the
fast-forward marker and VHS lines), `transition` (crossfade seconds) and
`scenes`. Changes show at once. **Save** writes them back into
`src/timeline.tsx`. The timeline at the bottom shows each scene as a named
sequence, and each clip part with its speed.

What the config means:

- Times are seconds. A scene's `captions`, `beats` and `loupe` keyframes count
  from the start of that scene. Scenes play in a fixed order (`SCENE_ORDER` in
  `src/schedule.ts`) and overlap by `transition`.
- Captions: `from`, `to`, `text`. At most two lines; the `.srt` uses the same
  cues and wraps at 42 characters.
- Animated scenes (`login`, `seal`, `stamp`, `end`) have `beats`: when each
  step starts.
- Clip scenes (`problem`, `enroll`, `moment`, `verify`) have a `clip`:
  - `src`: the file in `public/clips/`.
  - `parts`: `{from, to, speed}` in seconds of that file. Any part faster than
    1 shows the **FWD ▶▶ ×speed** marker and the VHS lines. A jump between
    parts is a cut.
  - `loupe`: the large panel at the right that magnifies part of the phone
    screen. Each keyframe gives the time `at`, the centre `x`, `y` as fractions
    of the screen (0 to 1) and the width `w` as a fraction of the screen width
    (1 = the whole width, 0.5 = twice as close). The loupe eases from one
    keyframe to the next.
  - `note`: the small line under the loupe, such as who did the typing.
  - `placeholder`: marks a clip that still has to be replaced.
- `defaultProps` in `src/timeline.tsx` must stay a plain literal (no
  variables or functions). Studio can then save into it, and `scripts/srt.mjs`
  can read it without running the video code.

## Files

| Path | What it holds |
|---|---|
| `src/timeline.tsx` | The config (zod schema plus values) and the composition |
| `src/schedule.ts` | Timing math: scene starts, captions, clip parts, the `.srt`. Shared by the video and `scripts/srt.mjs` |
| `src/Launch.tsx` | The layers, bottom to top: background, phone body, scenes, the mark and "testnet", captions |
| `src/scenes/` | One component per scene: `ClipScene` (the four recorded scenes), `LoginScene`, `SealScene` (animation A), `StampScene` (animation B), `EndScene` |
| `src/components/` | Phone, the drawn app screens and keyboard, the stage (NEAR, enclave, fingerprint, dial, storage, reader), the clip player with loupe, FWD marker and VHS lines, captions |
| `src/theme.ts` | The grid every scene shares: phone at the left, loupe or stage at the right, captions at the bottom right |
| `public/fonts/` | Inter (variable), the site's font, SIL Open Font License (`LICENSE.txt`) |
| `public/brand/` | The NTK mark and the 3D keyboard, from `brand/out/` (the keyboard rendered at 3× from its SVG) |
| `public/clips/` | The phone clips, cut and compressed (each well under 20 MB) |
| `scripts/cut.mjs` | Cuts ranges out of a recording into a clip for `public/clips/` |
| `scripts/srt.mjs` | Writes the `.srt` |
| `../tools/launch-clips.sh` | Records the phone clips on the emulator with the robot typist |

## Phone clips

The clips are recorded on the Android emulator AVD `NTK_Robot`. The script
refuses any other device. The typing and taps come from the test robot, a
synthetic typist, and the video says so under the loupe.

```bash
bash video/tools/launch-clips.sh problem   # /messages/?fresh=1, ending with Maya's question
bash video/tools/launch-clips.sh moment    # the robot answers with NTK, Sign, the tag, send
bash video/tools/launch-clips.sh check     # Maya's view: the stamp button, MATCH; one word changed: NO MATCH
bash video/tools/launch-clips.sh enroll    # Enroll, three prompts typed by the robot, "Fingerprint created"
```

Each take writes `video/raw/launch-<part>.mp4`, plus `.marks` with the times of
each step. The script prints those times in the video. Cut the take into a clip,
then set the clip's `parts` and `loupe` in Studio:

```bash
node scripts/cut.mjs --in ../raw/launch-moment.mp4 --out public/clips/moment.mp4 --range 2.0-38.0
```

A range written `<from>-<to>@2` keeps its length but only 2 different frames a
second. Use it for long stretches that play only at a high fast-forward, such
as a wait for the network. `--gop 150` puts fewer keyframes in a long clip. The
current clips were cut from the takes in `video/raw/` (not committed) like this:

| Clip | Cut |
|---|---|
| `problem.mp4` | `--in ../raw/launch-problem.mp4 --range 1.0-11.8` |
| `moment.mp4` | `--in ../raw/launch-moment.mp4 --range 2.0-38.0` |
| `verify.mp4` | `--in ../raw/launch-check.mp4 --range 2.0-60.4` |
| `enroll.mp4` | `--in ../raw/launch-enroll.mp4 --range 3.0-47.0 --range 47.0-358.0@2 --range 358.0-366.3 --gop 150` |

The `moment` take must come before `check`, which taps the stamp that
`moment` made. The robot types sessions from
`android/app/src/androidTest/assets/robot-sessions.json`. `v_reply` is the
answer to Maya. The robot account was enrolled with the same synthetic typist,
`alice`.

## Licences

- **Remotion** is free for individuals and for companies of up to 3 people.
  Larger companies need a company licence; see
  <https://www.remotion.dev/license>.
- Inter: SIL Open Font License 1.1, `public/fonts/LICENSE.txt`.
- The NTK mark and the keyboard image are NTK's own, generated by
  `brand/build.mjs`.
