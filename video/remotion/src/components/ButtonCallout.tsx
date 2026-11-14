// A callout over the loupe that explains the NTK stamp button: a ring around
// the button in the magnified screen, a thin line down to a panel with a title
// and lines. While the phone switches apps (AppCycle), the ring follows the
// current app's button and "{app}" in a line becomes that app's name. Texts and
// times come from the scene's `callout` and `cycle` in timeline.tsx.
import React from 'react';
import {FONT, Look, LOUPE, ramp, SHADOW} from '../theme';
import type {Timeline} from '../timeline';
import {cycleApp, CycleConfig, cycleTarget} from './AppCycle';
import {ClipConfig, inLoupe} from './Clip';

export type CalloutConfig = Timeline['scenes']['verify']['callout'];

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({position: 'absolute', left: x, top: y, ...extra});

/** How far the loupe follows the button away from the first app's (the clip's) button. */
export const cycleShift = (cycle: CycleConfig, t: number) => {
	const now = cycleTarget(cycle, t);
	const first = cycle.apps[0].target;
	return {x: now.x - first.x, y: now.y - first.y};
};

export const ButtonCallout: React.FC<{look: Look; clip: ClipConfig; callout: CalloutConfig; cycle: CycleConfig; t: number}> = ({
	look,
	clip,
	callout,
	cycle,
	t,
}) => {
	const shown = Math.min(ramp(t, callout.at, 0.6), 1 - ramp(t, callout.until - 0.5, 0.5));
	if (shown <= 0) return null;
	// the ring around the button, following the loupe and the apps
	const c = cycleTarget(cycle, t);
	const p = inLoupe(clip.loupe, t, c.x, c.y, cycleShift(cycle, t));
	const rw = c.w * 1080 * p.scale + 22;
	const rh = c.h * 2424 * p.scale + 22;
	// the name of the app shown now, faded across a switch
	const app = cycle.apps[cycleApp(cycle, t)];
	const panel = {x: LOUPE.x + 28, y: LOUPE.y + LOUPE.h - 28 - 220, w: LOUPE.w - 56, h: 220};
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
				<div style={abs(32, 26, {width: panel.w - 64})}>
					<div style={{fontFamily: FONT, fontSize: 36, fontWeight: look.titleWeight, color: look.ink, lineHeight: 1.1}}>{callout.title}</div>
					{callout.lines.map((l, i) => {
						const parts = l.split('{app}');
						return (
							<div key={i} style={{marginTop: i === 0 ? 18 : 10, fontFamily: FONT, fontSize: 22, fontWeight: 400, lineHeight: 1.4, color: i === 0 ? look.ink : look.ink2}}>
								{parts.map((part, k) => (
									<React.Fragment key={k}>
										{part}
										{k < parts.length - 1 ? <span style={{fontWeight: 600, color: look.ink}}>{app.label}</span> : null}
									</React.Fragment>
								))}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};
