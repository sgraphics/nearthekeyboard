// A callout over the loupe that explains the NTK stamp button: a ring around
// the button in the magnified screen, a thin line down to a panel with a title
// and two lines, and small flat app frames (a chat, a feed, a mail) that each
// show the same button on a tag, so "any app" is visible. All texts and times
// come from the scene's `callout` in timeline.tsx.
import React from 'react';
import {EASE_OUT, FONT, Look, LOUPE, mix, ramp, SHADOW, smallCaps} from '../theme';
import type {Timeline} from '../timeline';
import {ClipConfig, inLoupe} from './Clip';

export type CalloutConfig = Timeline['scenes']['verify']['callout'];
type AppKind = CalloutConfig['apps'][number]['kind'];

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({position: 'absolute', left: x, top: y, ...extra});

/** The stamp button as the phone draws it: a small orange pill with white type. */
const MiniButton: React.FC<{look: Look; x: number; y: number}> = ({look, x, y}) => (
	<div
		style={abs(x, y, {
			width: 34,
			height: 13,
			borderRadius: 4,
			background: look.orange,
			color: look.onOrange,
			fontFamily: FONT,
			fontSize: 7.5,
			fontWeight: 700,
			letterSpacing: '0.04em',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
		})}
	>
		NTK ✓
	</div>
);

/** A generic app screen, 104 x 150, in the video's flat style: grey lines for text, one tag with the button. */
const AppFrame: React.FC<{look: Look; kind: AppKind}> = ({look, kind}) => {
	const line = (x: number, y: number, w: number, color = look.line) => <div key={`${x}-${y}`} style={abs(x, y, {width: w, height: 6, borderRadius: 3, background: color})} />;
	return (
		<div style={{position: 'relative', width: 104, height: 150, borderRadius: 14, background: look.background, overflow: 'hidden'}}>
			<div style={abs(0, 0, {width: 104, height: 22, background: look.tile})} />
			<div style={abs(10, 6, {width: 10, height: 10, borderRadius: 5, background: look.minor})} />
			{line(26, 8, 40, look.minor)}
			{kind === 'chat' ? (
				<>
					<div style={abs(46, 32, {width: 48, height: 14, borderRadius: 7, background: look.line})} />
					<div style={abs(10, 54, {width: 62, height: 14, borderRadius: 7, background: look.panel})} />
					<div style={abs(10, 76, {width: 84, height: 34, borderRadius: 9, background: look.panel})} />
					{line(16, 83, 66)}
					{line(16, 96, 26)}
					<MiniButton look={look} x={46} y={93} />
				</>
			) : kind === 'feed' ? (
				<>
					<div style={abs(10, 32, {width: 14, height: 14, borderRadius: 7, background: look.minor})} />
					{line(30, 36, 44, look.minor)}
					{line(10, 54, 84)}
					{line(10, 66, 78)}
					{line(10, 78, 30)}
					<MiniButton look={look} x={44} y={75} />
					<div style={abs(10, 100, {width: 84, height: 1, background: look.line})} />
					{line(10, 110, 70)}
					{line(10, 122, 56)}
				</>
			) : (
				<>
					{line(10, 32, 60, look.minor)}
					{line(10, 46, 84)}
					{line(10, 58, 80)}
					{line(10, 70, 84)}
					{line(10, 82, 28)}
					<MiniButton look={look} x={42} y={79} />
					{line(10, 104, 50)}
				</>
			)}
		</div>
	);
};

export const ButtonCallout: React.FC<{look: Look; clip: ClipConfig; callout: CalloutConfig; t: number}> = ({look, clip, callout, t}) => {
	const shown = Math.min(ramp(t, callout.at, 0.6), 1 - ramp(t, callout.until - 0.5, 0.5));
	if (shown <= 0) return null;
	// the ring around the button, following the loupe
	const c = callout.target;
	const p = inLoupe(clip.loupe, t, c.x, c.y);
	const rw = c.w * 1080 * p.scale + 22;
	const rh = c.h * 2424 * p.scale + 22;
	// the panel at the foot of the loupe
	const panel = {x: LOUPE.x + 28, y: LOUPE.y + LOUPE.h - 28 - 262, w: LOUPE.w - 56, h: 262};
	const rise = (k: number) => {
		const q = ramp(t, callout.appsAt + k * 0.35, 0.5, EASE_OUT);
		return {opacity: q, transform: `translateY(${mix(14, 0, q)}px)`};
	};
	return (
		<div style={{opacity: shown}}>
			<div
				style={abs(p.x - rw / 2, p.y - rh / 2, {
					width: rw,
					height: rh,
					borderRadius: 12,
					border: `3px solid ${look.orange}`,
					boxSizing: 'border-box',
					boxShadow: '0 0 0 6px rgba(253,91,21,0.12)',
				})}
			/>
			<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
				<line x1={p.x} y1={p.y + rh / 2} x2={p.x} y2={panel.y} stroke={look.orange} strokeWidth={2.5} />
				<circle cx={p.x} cy={panel.y} r={4} fill={look.orange} />
			</svg>
			<div style={abs(panel.x, panel.y, {width: panel.w, height: panel.h, borderRadius: 18, background: look.panel, boxShadow: SHADOW})}>
				<div style={abs(32, 26, {width: 560})}>
					<div style={{fontFamily: FONT, fontSize: 36, fontWeight: look.titleWeight, color: look.ink, lineHeight: 1.1}}>{callout.title}</div>
					{callout.lines.map((l, i) => (
						<div key={i} style={{marginTop: i === 0 ? 18 : 12, fontFamily: FONT, fontSize: 20, fontWeight: 400, lineHeight: 1.42, color: i === 0 ? look.ink : look.ink2}}>
							{l}
						</div>
					))}
				</div>
				<div style={abs(620, 34, {display: 'flex', gap: 24})}>
					{callout.apps.map((a, i) => (
						<div key={a.label + i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, ...rise(i)}}>
							<AppFrame look={look} kind={a.kind} />
							<span style={smallCaps(look.ink2, 11)}>{a.label}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
