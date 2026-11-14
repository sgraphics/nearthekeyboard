// Fixed layout of the 1920 x 1080 frame and small helpers. Colours come from
// the config (timeline.tsx, `look`); positions live here because they are the
// grid every scene shares: the phone always stands at the left, the stage or
// the loupe fills the right, captions sit at the bottom right.
import {CSSProperties} from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {FPS} from './schedule';
import type {Timeline} from './timeline';

export type Look = Timeline['look'];
export type Story = Timeline['story'];

export const FONT = 'Inter, system-ui, sans-serif';

/** The phone: a dark body, the screen inside it, the label under it. Screen aspect = 1080 x 2424. */
const SCREEN_W = 384;
const SCREEN_H = Math.round((SCREEN_W * 2424) / 1080); // 862
const BEZEL = 13;
export const PHONE = {
	x: 400 - (SCREEN_W + 2 * BEZEL) / 2,
	y: 58,
	w: SCREEN_W + 2 * BEZEL,
	h: SCREEN_H + 2 * BEZEL,
	bezel: BEZEL,
	radius: 56,
	screenRadius: 44,
	screenW: SCREEN_W,
	screenH: SCREEN_H,
	labelY: 58 + SCREEN_H + 2 * BEZEL + 26,
};
/** The screen's top-left corner on the frame. */
export const SCREEN = {x: PHONE.x + BEZEL, y: PHONE.y + BEZEL, w: SCREEN_W, h: SCREEN_H};

/** The right side of the frame. */
export const RIGHT = {x: 760, w: 1080};
export const LABEL_Y = 58;
export const LOUPE = {x: RIGHT.x, y: 104, w: RIGHT.w, h: 680, radius: 22};
export const NOTE_Y = LOUPE.y + LOUPE.h + 18;
export const CAPTION = {x: RIGHT.x, bottom: 1012, w: RIGHT.w};

/** The stage of the animations. */
export const STAGE = {
	near: {x: RIGHT.x, y: 104, w: RIGHT.w, h: 170},
	enclave: {x: 930, y: 324, w: 570, h: 526},
	storage: {x: 1540, y: 324, w: 300, h: 250},
	reader: {x: 1540, y: 600, w: 300, h: 250},
	tray: {x: 640, y: 470, w: 262, h: 214},
};

export const SHADOW = '0 1px 3px rgba(60,72,100,.07), 0 6px 18px rgba(60,72,100,.09)';
export const SHADOW_LIFT = '0 2px 6px rgba(60,72,100,.10), 0 18px 40px rgba(60,72,100,.16)';

/** Small bold capitals with letter-spacing, as on the site's labels. */
export const smallCaps = (color: string, size = 15): CSSProperties => ({
	fontFamily: FONT,
	fontSize: size,
	fontWeight: 700,
	letterSpacing: '0.12em',
	textTransform: 'uppercase',
	color,
	lineHeight: 1,
	whiteSpace: 'nowrap',
});

/** Seconds since the start of the current Sequence. */
export const useSeconds = () => useCurrentFrame() / FPS;

/** Slow in, slow out. */
export const EASE = Easing.bezier(0.45, 0, 0.25, 1);
export const EASE_OUT = Easing.bezier(0.2, 0.7, 0.3, 1);

/** 0 before `at`, 1 after `at + dur`, eased between. */
export const ramp = (t: number, at: number, dur = 0.5, easing = EASE) =>
	dur <= 0 ? (t >= at ? 1 : 0) : interpolate(t, [at, at + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

/** Fades in at `at`, out at `until` (both over `dur`). */
export const shown = (t: number, at: number, until = Infinity, dur = 0.4) =>
	Math.min(ramp(t, at, dur, Easing.linear), until === Infinity ? 1 : 1 - ramp(t, until - dur, dur, Easing.linear));

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** A point on a quadratic curve from a to b, bending through c. */
export const curve = (a: [number, number], c: [number, number], b: [number, number], p: number): [number, number] => {
	const q = 1 - p;
	return [q * q * a[0] + 2 * q * p * c[0] + p * p * b[0], q * q * a[1] + 2 * q * p * c[1] + p * p * b[1]];
};

/** A stable pseudo-random number in [0, 1) for a seed string. */
export const hash01 = (s: string) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return ((h >>> 0) % 100000) / 100000;
};
