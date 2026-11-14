// A recorded phone clip: its parts at their speeds (FWD where faster than 1),
// on the phone's screen and magnified in the loupe, with the VHS lines and the
// FWD marker while a part runs fast.
import React, {CSSProperties} from 'react';
import {Freeze, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {clipPlan, FPS, PartPlan, speedAt} from '../schedule';
import {EASE, FONT, Look, LOUPE, mix, NOTE_Y, SCREEN, SHADOW, smallCaps} from '../theme';
import type {Timeline} from '../timeline';
import {FastForward} from './Icons';

export type ClipConfig = Timeline['scenes']['moment']['clip'];
type Fwd = Timeline['fwd'];
type Focus = ClipConfig['loupe'][number];

/** Source frames of the screen recordings: 1080 x 2424 (any size with that aspect works). */
const ASPECT = 2424 / 1080;

/** The clip's frames, laid out by its parts; the first frame waits before the start, the last one stays after the end. */
export const ClipFrames: React.FC<{clip: ClipConfig; style: CSSProperties}> = ({clip, style}) => {
	const frame = useCurrentFrame();
	const {parts, start, end} = clipPlan(clip);
	if (!parts.length) return null;
	const src = staticFile(clip.src);
	const first = parts[0];
	const last = parts[parts.length - 1];
	return (
		<>
			{frame < start ? (
				<Freeze frame={first.srcFrom}>
					<OffthreadVideo src={src} muted style={style} />
				</Freeze>
			) : null}
			{parts.map((p, i) => (
				<Sequence key={i} from={p.start} durationInFrames={p.frames} premountFor={15} name={`part ${i + 1} ×${p.speed}`}>
					<PartVideo src={src} part={p} style={style} />
				</Sequence>
			))}
			{frame >= end ? (
				<Freeze frame={Math.max(0, last.srcTo - 1)}>
					<OffthreadVideo src={src} muted style={style} />
				</Freeze>
			) : null}
		</>
	);
};

/** Browsers play video at most 16 times faster; above that each frame is picked one by one (a still per frame). */
const MAX_NATIVE_SPEED = 16;

const PartVideo: React.FC<{src: string; part: PartPlan; style: CSSProperties}> = ({src, part, style}) => {
	const frame = useCurrentFrame();
	if (part.speed <= MAX_NATIVE_SPEED) return <OffthreadVideo src={src} muted trimBefore={part.srcFrom} playbackRate={part.speed} style={style} />;
	const at = Math.min(part.srcTo - 1, part.srcFrom + Math.round(frame * part.speed));
	return (
		<Freeze frame={at}>
			<OffthreadVideo src={src} muted style={style} />
		</Freeze>
	);
};

/** How strongly the fast-forward look shows at a frame: 0 at normal speed, 1 while fast, short fades between. */
export const fwdStrength = (parts: PartPlan[], frame: number) => {
	const fade = 3;
	let best = 0;
	for (const p of parts) {
		if (p.speed <= 1) continue;
		const a = p.start;
		const b = p.start + p.frames;
		if (frame < a - fade || frame > b + fade) continue;
		const s = Math.min(1, (frame - (a - fade)) / fade, (b + fade - frame) / fade);
		best = Math.max(best, Math.max(0, s));
	}
	return best;
};

/** The loupe's region at scene time t: keyframes eased one into the next. */
export const focusAt = (keys: Focus[], t: number): Focus => {
	if (!keys.length) return {at: 0, x: 0.5, y: 0.5, w: 1};
	const k = [...keys].sort((a, b) => a.at - b.at);
	if (t <= k[0].at) return k[0];
	for (let i = 0; i + 1 < k.length; i++) {
		const a = k[i];
		const b = k[i + 1];
		if (t <= b.at) {
			const p = EASE(b.at > a.at ? (t - a.at) / (b.at - a.at) : 1);
			return {at: t, x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), w: mix(a.w, b.w, p)};
		}
	}
	return k[k.length - 1];
};

/** The region as fractions of the screen, kept inside the screen when it is narrower than the screen. */
export const region = (f: Focus) => {
	const w = f.w;
	const h = (LOUPE.h / LOUPE.w) * (w / ASPECT);
	const x = w < 1 ? Math.min(1 - w / 2, Math.max(w / 2, f.x)) : 0.5;
	const y = h < 1 ? Math.min(1 - h / 2, Math.max(h / 2, f.y)) : 0.5;
	return {x, y, w, h};
};

/** Where a point of the screen (fractions) shows in the loupe at scene time t, on the frame; and how much the loupe magnifies. */
export const inLoupe = (keys: Focus[], t: number, px: number, py: number, shift = {x: 0, y: 0}) => {
	const f = focusAt(keys, t);
	const r = region({...f, x: f.x + shift.x, y: f.y + shift.y});
	const fullW = LOUPE.w / r.w;
	const fullH = fullW * ASPECT;
	return {x: LOUPE.x + LOUPE.w / 2 + (px - r.x) * fullW, y: LOUPE.y + LOUPE.h / 2 + (py - r.y) * fullH, scale: fullW / 1080};
};

/** VHS tracking lines and a little grain over a box, at `strength` (0..1); only when `fwd.vhs` is on. */
export const Vhs: React.FC<{w: number; h: number; strength: number; fwd: Fwd}> = ({w, h, strength, fwd}) => {
	const frame = useCurrentFrame();
	if (strength <= 0 || !fwd.vhs) return null;
	const t = frame / FPS;
	// Two tracking bands drifting down at different speeds: a soft grey band with a bright line on its top
	// edge and a faint dark one under it, so they show on light screens as well as dark ones.
	const y1 = (t * 0.21 * h) % (h * 1.15) - h * 0.08;
	const y2 = (t * 0.13 * h + h * 0.52) % (h * 1.15) - h * 0.08;
	const band = (y: number, height: number, alpha: number): React.ReactNode => (
		<div style={{position: 'absolute', left: 0, top: y, width: w, height}}>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: `linear-gradient(to bottom, rgba(40,48,70,0) 0%, rgba(40,48,70,${0.16 * alpha}) 35%, rgba(40,48,70,${0.1 * alpha}) 70%, rgba(40,48,70,0) 100%)`,
				}}
			/>
			<div style={{position: 'absolute', left: 0, top: height * 0.3, width: w, height: 2, background: `rgba(255,255,255,${0.85 * alpha})`}} />
			<div style={{position: 'absolute', left: 0, top: height * 0.3 + 2, width: w, height: 1, background: `rgba(20,24,36,${0.22 * alpha})`}} />
		</div>
	);
	const id = `grain-${Math.round(w)}-${Math.round(h)}`;
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, opacity: strength, pointerEvents: 'none', overflow: 'hidden'}}>
			{band(y1, Math.max(10, h / 36), fwd.lines * 2)}
			{band(y2, Math.max(6, h / 70), fwd.lines * 1.4)}
			{fwd.grain > 0 ? (
				<svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, opacity: 0.32 * fwd.grain, mixBlendMode: 'multiply'}}>
					<filter id={id}>
						<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={1} seed={frame % 61} />
						<feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.48  0 0 0 0 0.55  0 0 0 1.4 -0.45" />
					</filter>
					<rect width={w} height={h} filter={`url(#${id})`} />
				</svg>
			) : null}
		</div>
	);
};

/** "FWD ▶▶ ×8", the video recorder's on-screen display. */
export const FwdChip: React.FC<{speed: number; strength: number; fwd: Fwd; scale?: number}> = ({speed, strength, fwd, scale = 1}) => {
	if (strength <= 0) return null;
	const s = scale;
	return (
		<div
			style={{
				position: 'absolute',
				left: 22 * s,
				top: 22 * s,
				display: 'flex',
				alignItems: 'center',
				gap: 12 * s,
				padding: `${10 * s}px ${16 * s}px`,
				borderRadius: 10 * s,
				background: 'rgba(10,12,16,0.68)',
				color: '#FFFFFF',
				fontFamily: FONT,
				fontSize: 26 * s,
				fontWeight: 600,
				letterSpacing: '0.1em',
				lineHeight: 1,
				opacity: strength,
			}}
		>
			<span>{fwd.label}</span>
			<FastForward size={20 * s} color="#FFFFFF" />
			{fwd.showSpeed ? <span style={{fontWeight: 400, letterSpacing: '0.02em', fontSize: 22 * s}}>×{Math.round(speed * 10) / 10}</span> : null}
		</div>
	);
};

/** The clip on the phone's screen, with the VHS lines while fast. */
/** What the screen shows before the clip starts, instead of its first frame, at a given size; and how far the loupe follows it. */
export type PreStart = {render: (w: number, h: number) => React.ReactNode; shift: {x: number; y: number}};

export const ScreenClip: React.FC<{clip: ClipConfig; fwd: Fwd; pre?: PreStart}> = ({clip, fwd, pre}) => {
	const frame = useCurrentFrame();
	const {parts} = clipPlan(clip);
	const strength = fwdStrength(parts, frame);
	return (
		<>
			{pre && frame < clipPlan(clip).start ? (
				pre.render(SCREEN.w, SCREEN.h)
			) : (
				<ClipFrames clip={clip} style={{position: 'absolute', left: 0, top: 0, width: SCREEN.w, height: SCREEN.h}} />
			)}
			<Vhs w={SCREEN.w} h={SCREEN.h} strength={strength} fwd={fwd} />
		</>
	);
};

/** The loupe: the region of the screen it looks at, framed on the phone and joined to it by two thin lines. */
export const Loupe: React.FC<{clip: ClipConfig; look: Look; fwd: Fwd; t: number; pre?: PreStart}> = ({clip, look, fwd, t, pre}) => {
	const frame = useCurrentFrame();
	const {parts} = clipPlan(clip);
	const strength = fwdStrength(parts, frame);
	const before = pre && frame < clipPlan(clip).start ? pre : null;
	const f = focusAt(clip.loupe, t);
	const r = region(before ? {...f, x: f.x + before.shift.x, y: f.y + before.shift.y} : f);
	const fullW = LOUPE.w / r.w;
	const fullH = fullW * ASPECT;
	const left = LOUPE.w / 2 - r.x * fullW;
	const top = LOUPE.h / 2 - r.y * fullH;
	// the framed region on the phone
	const fx = SCREEN.x + (r.x - r.w / 2) * SCREEN.w;
	const fy = SCREEN.y + (r.y - r.h / 2) * SCREEN.h;
	const fw = r.w * SCREEN.w;
	const fh = r.h * SCREEN.h;
	return (
		<>
			<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
				<line x1={fx + fw} y1={fy} x2={LOUPE.x} y2={LOUPE.y + 1} stroke={look.minor} strokeWidth={1.5} />
				<line x1={fx + fw} y1={fy + fh} x2={LOUPE.x} y2={LOUPE.y + LOUPE.h - 1} stroke={look.minor} strokeWidth={1.5} />
			</svg>
			<div
				style={{
					position: 'absolute',
					left: fx,
					top: fy,
					width: fw,
					height: fh,
					border: `2px solid ${look.orange}`,
					borderRadius: 6,
					boxSizing: 'border-box',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: LOUPE.x,
					top: LOUPE.y,
					width: LOUPE.w,
					height: LOUPE.h,
					borderRadius: LOUPE.radius,
					overflow: 'hidden',
					background: look.panel,
					boxShadow: SHADOW,
				}}
			>
				{before ? (
					<div style={{position: 'absolute', left, top, width: fullW, height: fullH}}>{before.render(fullW, fullH)}</div>
				) : (
					<ClipFrames clip={clip} style={{position: 'absolute', left, top, width: fullW, height: fullH}} />
				)}
				<Vhs w={LOUPE.w} h={LOUPE.h} strength={strength} fwd={fwd} />
				<FwdChip speed={speedAt(parts, frame)} strength={strength} fwd={fwd} />
				{clip.placeholder ? (
					<div
						style={{
							position: 'absolute',
							right: 18,
							bottom: 18,
							padding: '9px 12px',
							borderRadius: 8,
							border: `2px dashed ${look.orange}`,
							background: 'rgba(243,246,252,0.92)',
							...smallCaps(look.orange, 13),
						}}
					>
						Placeholder clip · old look · re-record
					</div>
				) : null}
			</div>
			{clip.note ? (
				<div style={{position: 'absolute', left: LOUPE.x, top: NOTE_Y, fontFamily: FONT, fontSize: 21, fontWeight: 400, color: look.ink2}}>{clip.note}</div>
			) : null}
		</>
	);
};
