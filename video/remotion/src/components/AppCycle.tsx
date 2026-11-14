// The check scene's app cycle, before Maya taps: her phone switches between
// apps that show a stamped text, each with the NTK button on its tag (Messages,
// a social feed, a forum, email), with horizontal slides like switching apps,
// then back to Messages. Recorded screens are frames of clips; the forum and
// email screens are drawn in a plain generic app style and labelled
// "illustration". Everything is set in the scene's `cycle` in timeline.tsx.
import React from 'react';
import {Freeze, OffthreadVideo, staticFile} from 'remotion';
import {clipPlan, toFrames} from '../schedule';
import {EASE, Look} from '../theme';
import type {Timeline} from '../timeline';
import type {ClipConfig} from './Clip';

export type CycleConfig = Timeline['scenes']['verify']['cycle'];
type Target = CycleConfig['apps'][number]['target'];

/** Where the strip is at time t: 0 = the first app, 1 = the second, ...; the last slide returns to the first. */
export const cyclePos = (c: CycleConfig, t: number) => {
	let pos = 0;
	for (let k = 0; k < c.apps.length; k++) {
		const start = c.at + k * c.every;
		const p = Math.max(0, Math.min(1, (t - start) / Math.max(0.05, c.slide)));
		pos += EASE(p);
	}
	return pos;
};

/** The app shown most at time t (index into c.apps). */
export const cycleApp = (c: CycleConfig, t: number) => Math.round(cyclePos(c, t)) % c.apps.length;

/** The stamp button's place on the screen at time t, gliding from one app's to the next during a slide. */
export const cycleTarget = (c: CycleConfig, t: number): Target => {
	const pos = cyclePos(c, t);
	const n = c.apps.length;
	const a = c.apps[Math.floor(pos) % n].target;
	const b = c.apps[Math.ceil(pos) % n].target;
	const f = pos - Math.floor(pos);
	const mix = (x: number, y: number) => x + (y - x) * f;
	return {x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: mix(a.h, b.h)};
};

// ---- the drawn screens: 1080 x 2424 units, scaled to wherever they are shown ----------------

const SANS = 'Roboto, Arial, Helvetica, sans-serif';
const INK = '#1A1A1B';
const GREY = '#6B6F73';
const RULE = '#E6E8EA';

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({position: 'absolute', left: x, top: y, ...extra});

/** The NTK button as Android draws it over a tag: orange, white type, at the target's place. */
const StampButton: React.FC<{look: Look; target: Target}> = ({look, target}) => {
	const w = target.w * 1080;
	const h = target.h * 2424;
	return (
		<div
			style={abs(target.x * 1080 - w / 2, target.y * 2424 - h / 2, {
				width: w,
				height: h,
				borderRadius: 6,
				background: look.orange,
				color: look.onOrange,
				fontFamily: SANS,
				fontSize: 34,
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
};

/** The line that ends at the tag: right-aligned so that it meets the button whatever the font. */
const LineToTag: React.FC<{text: string; target: Target; left: number; size: number}> = ({text, target, left, size}) => {
	const right = target.x * 1080 - (target.w * 1080) / 2 - 14;
	return (
		<div style={abs(left, target.y * 2424 - size * 0.62, {width: right - left, textAlign: 'right', fontFamily: SANS, fontSize: size, color: INK, whiteSpace: 'nowrap'})}>
			{text}
		</div>
	);
};

/** A stamped text: its lines stacked so that the last one ends at the button. Returns the top of the first line. */
const stampedTop = (lines: string[], target: Target, size: number, gap: number) => target.y * 2424 - size * 0.62 - (lines.length - 1) * gap;
const StampedLines: React.FC<{lines: string[]; target: Target; left: number; size: number; gap: number}> = ({lines, target, left, size, gap}) => {
	const top = stampedTop(lines, target, size, gap);
	return (
		<>
			{lines.slice(0, -1).map((l, k) => (
				<div key={k} style={abs(left, top + k * gap, {fontFamily: SANS, fontSize: size, color: INK, whiteSpace: 'nowrap'})}>
					{l}
				</div>
			))}
			<LineToTag text={lines[lines.length - 1] ?? ''} target={target} left={left} size={size} />
		</>
	);
};

const Illustration: React.FC<{x: number; y: number}> = ({x, y}) => (
	<div style={abs(x, y, {padding: '8px 16px', borderRadius: 22, background: '#F1F3F4', color: '#5F6368', fontFamily: SANS, fontSize: 26, letterSpacing: '0.08em'})}>
		ILLUSTRATION
	</div>
);

const StatusBar: React.FC = () => (
	<>
		<div style={abs(60, 34, {fontFamily: SANS, fontSize: 38, color: INK})}>12:00</div>
		<svg style={abs(900, 40)} width={120} height={36} viewBox="0 0 120 36">
			<path d="M4 14 Q24 -2 44 14 L24 34 Z" fill={INK} />
			<rect x="66" y="6" width="44" height="26" rx="5" fill="none" stroke={INK} strokeWidth="3" />
			<rect x="71" y="11" width="34" height="16" rx="2" fill={INK} />
		</svg>
	</>
);

/** A forum thread with comments; the stamped comment carries the button. No names or logos of real sites. */
const ForumScreen: React.FC<{look: Look; app: CycleConfig['apps'][number]}> = ({look, app}) => {
	const t = app.target;
	const tagY = t.y * 2424;
	const top = stampedTop(app.lines, t, 40, 56);
	const comment = (y: number, who: string, lines: string[], indent = 60) => (
		<>
			<div style={abs(indent, y, {width: 52, height: 52, borderRadius: 26, background: '#D7DADC'})} />
			<div style={abs(indent + 70, y + 8, {fontFamily: SANS, fontSize: 32, color: GREY})}>{who}</div>
			{lines.map((l, i) => (
				<div key={i} style={abs(indent + 70, y + 74 + i * 56, {fontFamily: SANS, fontSize: 40, color: INK, whiteSpace: 'nowrap'})}>
					{l}
				</div>
			))}
		</>
	);
	return (
		<div style={{position: 'relative', width: 1080, height: 2424, background: '#FFFFFF', overflow: 'hidden'}}>
			<StatusBar />
			<div style={abs(0, 120, {width: 1080, height: 140, borderBottom: `2px solid ${RULE}`})} />
			<div style={abs(60, 152, {fontFamily: SANS, fontSize: 56, color: INK})}>←</div>
			<div style={abs(160, 158, {fontFamily: SANS, fontSize: 44, fontWeight: 500, color: INK})}>Comments</div>
			<div style={abs(60, 300, {fontFamily: SANS, fontSize: 30, color: GREY})}>forum · posted 5 h ago</div>
			<div style={abs(60, 350, {width: 960, fontFamily: SANS, fontSize: 50, fontWeight: 700, lineHeight: 1.25, color: INK})}>
				Do people still write their own replies?
			</div>
			<div style={abs(60, 500, {width: 940, height: 26, borderRadius: 13, background: '#EDEFF1'})} />
			<div style={abs(60, 546, {width: 780, height: 26, borderRadius: 13, background: '#EDEFF1'})} />
			<div style={abs(60, 620, {fontFamily: SANS, fontSize: 32, color: GREY})}>▲ 128 ▼     💬 42     Share</div>
			<div style={abs(0, 700, {width: 1080, height: 16, background: '#F6F7F8'})} />
			{comment(760, 'reader_42 · 3 h', ['Half the replies here sound like a', 'chatbot wrote them.'])}
			<div style={abs(60, 1010, {fontFamily: SANS, fontSize: 30, color: GREY})}>▲ 31 ▼     Reply</div>
			{/* the stamped comment: its last line ends at the button */}
			<div style={abs(84, top - 110, {width: 4, height: tagY - top + 230, background: RULE})} />
			<div style={abs(120, top - 100, {width: 52, height: 52, borderRadius: 26, background: '#D7DADC'})} />
			<div style={abs(190, top - 92, {fontFamily: SANS, fontSize: 32, color: GREY})}>sam · 2 h</div>
			<Illustration x={640} y={top - 102} />
			<StampedLines lines={app.lines} target={t} left={190} size={40} gap={56} />
			<StampButton look={look} target={t} />
			<div style={abs(190, tagY + 70, {fontFamily: SANS, fontSize: 30, color: GREY})}>▲ 12 ▼     Reply</div>
			{comment(tagY + 190, 'another_user · 1 h', ['How does anyone check that?'], 120)}
			<div style={abs(0, 2250, {width: 1080, height: 174, borderTop: `2px solid ${RULE}`, background: '#FFFFFF'})} />
			<div style={abs(60, 2280, {width: 960, height: 96, borderRadius: 48, background: '#F6F7F8', fontFamily: SANS, fontSize: 36, color: GREY, display: 'flex', alignItems: 'center', paddingLeft: 40, boxSizing: 'border-box'})}>
				Add a comment
			</div>
		</div>
	);
};

/** An email, opened; the stamped line carries the button. */
const EmailScreen: React.FC<{look: Look; app: CycleConfig['apps'][number]}> = ({look, app}) => {
	const t = app.target;
	const tagY = t.y * 2424;
	return (
		<div style={{position: 'relative', width: 1080, height: 2424, background: '#FFFFFF', overflow: 'hidden'}}>
			<StatusBar />
			<div style={abs(60, 152, {fontFamily: SANS, fontSize: 56, color: INK})}>←</div>
			<div style={abs(620, 160, {fontFamily: SANS, fontSize: 44, color: GREY, letterSpacing: '0.4em'})}>▢ ⌫ ✉ ⋮</div>
			<div style={abs(60, 340, {width: 960, fontFamily: SANS, fontSize: 56, lineHeight: 1.2, color: INK})}>Re: Thank you note</div>
			<div style={abs(60, 440, {width: 140, height: 50, borderRadius: 10, background: '#F1F3F4', fontFamily: SANS, fontSize: 28, color: GREY, display: 'flex', alignItems: 'center', justifyContent: 'center'})}>
				Inbox
			</div>
			<div style={abs(60, 560, {width: 100, height: 100, borderRadius: 50, background: '#7B8794', color: '#FFFFFF', fontFamily: SANS, fontSize: 48, display: 'flex', alignItems: 'center', justifyContent: 'center'})}>
				S
			</div>
			<div style={abs(190, 566, {fontFamily: SANS, fontSize: 40, fontWeight: 700, color: INK})}>Sam</div>
			<div style={abs(190, 618, {fontFamily: SANS, fontSize: 32, color: GREY})}>to me · 09:52</div>
			<div style={abs(60, stampedTop(app.lines, t, 40, 60) - 130, {fontFamily: SANS, fontSize: 40, color: INK})}>Hi Maya,</div>
			<Illustration x={520} y={stampedTop(app.lines, t, 40, 60) - 66} />
			<StampedLines lines={app.lines} target={t} left={60} size={40} gap={60} />
			<StampButton look={look} target={t} />
			<div style={abs(60, tagY + 110, {fontFamily: SANS, fontSize: 40, color: INK})}>Sam</div>
			<div style={abs(0, 2250, {width: 1080, height: 174, borderTop: `2px solid ${RULE}`})} />
			<div style={abs(60, 2290, {display: 'flex', gap: 30})}>
				{['Reply', 'Forward'].map((b) => (
					<div key={b} style={{width: 300, height: 90, borderRadius: 45, border: `2px solid ${RULE}`, fontFamily: SANS, fontSize: 34, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
						{b}
					</div>
				))}
			</div>
		</div>
	);
};

/** One app's screen at w x h. */
const AppScreen: React.FC<{look: Look; clip: ClipConfig; app: CycleConfig['apps'][number]; w: number; h: number}> = ({look, clip, app, w, h}) => {
	if (app.kind === 'clip' || app.kind === 'video') {
		const src = staticFile(app.kind === 'clip' ? clip.src : app.src);
		const frame = app.kind === 'clip' ? (clipPlan(clip).parts[0]?.srcFrom ?? 0) : toFrames(app.frame);
		return (
			<Freeze frame={frame}>
				<OffthreadVideo src={src} muted style={{position: 'absolute', left: 0, top: 0, width: w, height: h}} />
			</Freeze>
		);
	}
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 2424, transform: `scale(${w / 1080})`, transformOrigin: 'top left'}}>
			{app.kind === 'forum' ? <ForumScreen look={look} app={app} /> : <EmailScreen look={look} app={app} />}
		</div>
	);
};

/** The phone's screen during the cycle, at w x h: the apps side by side, sliding. */
export const CycleScreen: React.FC<{look: Look; clip: ClipConfig; cycle: CycleConfig; t: number; w: number; h: number; style?: React.CSSProperties}> = ({
	look,
	clip,
	cycle,
	t,
	w,
	h,
	style,
}) => {
	const pos = cyclePos(cycle, t);
	const n = cycle.apps.length;
	const panels = [];
	for (let i = Math.floor(pos); i <= Math.ceil(pos) && i <= n; i++) {
		if (Math.abs(i - pos) >= 1) continue;
		panels.push(
			<div key={i} style={{position: 'absolute', left: (i - pos) * w, top: 0, width: w, height: h, overflow: 'hidden', boxShadow: i > pos ? '-8px 0 24px rgba(0,0,0,0.12)' : undefined}}>
				<AppScreen look={look} clip={clip} app={cycle.apps[i % n]} w={w} h={h} />
			</div>,
		);
	}
	return <div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden', background: '#FFFFFF', ...style}}>{panels}</div>;
};
