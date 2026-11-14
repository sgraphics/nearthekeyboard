// A finger that taps: a flat grey fingertip coming up from below, and the
// ring a touch leaves (like Android's "show taps").
import React from 'react';
import {curve, EASE, Look, mix, ramp} from '../theme';

type Pt = [number, number];

/** Where the fingertip is at time t, given the taps (time and point), entering from and leaving to `rest`. */
export const fingerPath = (t: number, taps: {at: number; pt: Pt}[], rest: Pt, move = 0.5): {pt: Pt; press: number; opacity: number} => {
	if (!taps.length) return {pt: rest, press: 0, opacity: 0};
	const enter = taps[0].at - 0.7;
	const leave = taps[taps.length - 1].at + 0.45;
	if (t < enter || t > leave + 0.7) return {pt: rest, press: 0, opacity: 0};
	let pt: Pt = taps[0].pt;
	if (t < taps[0].at) {
		const p = EASE(Math.min(1, (t - enter) / 0.7));
		pt = curve(rest, [mix(rest[0], taps[0].pt[0], 0.5) + 60, mix(rest[1], taps[0].pt[1], 0.5)], taps[0].pt, p);
	} else if (t > leave) {
		const p = EASE(Math.min(1, (t - leave) / 0.7));
		const last = taps[taps.length - 1].pt;
		pt = curve(last, [mix(last[0], rest[0], 0.5) + 60, mix(last[1], rest[1], 0.5)], rest, p);
	} else {
		// the last tap at or before t, and the next one
		let i = taps.length - 1;
		for (let k = 0; k < taps.length; k++) {
			if (t < taps[k].at) {
				i = k - 1;
				break;
			}
		}
		const a = taps[i];
		const b = taps[i + 1];
		pt = a.pt;
		if (b) {
			const start = Math.max(a.at + 0.15, b.at - move);
			if (t >= start) {
				const p = EASE(Math.min(1, (t - start) / (b.at - start)));
				const lift = Math.sin(p * Math.PI) * 26;
				pt = [mix(a.pt[0], b.pt[0], p), mix(a.pt[1], b.pt[1], p) - lift];
			}
		}
	}
	// pressed for a moment at each tap
	let press = 0;
	for (const k of taps) press = Math.max(press, 1 - Math.min(1, Math.abs(t - (k.at + 0.06)) / 0.14));
	const opacity = Math.min(ramp(t, enter, 0.3), 1 - ramp(t, leave + 0.4, 0.3));
	return {pt, press, opacity};
};

export const Finger: React.FC<{look: Look; pt: Pt; press: number; opacity: number}> = ({pt, press, opacity}) => {
	if (opacity <= 0) return null;
	const [x, y] = pt;
	return (
		<svg
			width={140}
			height={460}
			viewBox="0 0 140 460"
			style={{
				position: 'absolute',
				left: x - 50,
				top: y - 14 + press * 3,
				opacity,
				overflow: 'visible',
				transformOrigin: '50px 14px',
				transform: `rotate(-16deg) scale(${0.86 - press * 0.025})`,
				filter: 'drop-shadow(0 10px 18px rgba(40,50,72,0.28))',
			}}
		>
			<rect x={20} y={0} width={60} height={460} rx={30} fill="#D0D6E1" />
			<rect x={30} y={8} width={40} height={50} rx={17} fill="#E7EAF0" />
			<path d="M30 92 Q50 98 70 92" stroke="#B9C0CE" strokeWidth={2} fill="none" strokeLinecap="round" />
			<path d="M32 196 Q50 202 68 196" stroke="#B9C0CE" strokeWidth={2} fill="none" strokeLinecap="round" />
		</svg>
	);
};

/** The ring a tap leaves, growing and fading. */
export const TapRing: React.FC<{look: Look; pt: Pt; t: number; at: number}> = ({look, pt, t, at}) => {
	const p = (t - at) / 0.5;
	if (p < 0 || p > 1) return null;
	const r = 12 + p * 26;
	return (
		<div
			style={{
				position: 'absolute',
				left: pt[0] - r,
				top: pt[1] - r,
				width: r * 2,
				height: r * 2,
				borderRadius: r,
				border: `3px solid ${look.ink2}`,
				opacity: (1 - p) * 0.55,
				boxSizing: 'border-box',
			}}
		/>
	);
};
