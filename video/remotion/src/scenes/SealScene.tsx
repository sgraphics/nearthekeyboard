// Animation A, enrollment: a finger taps keys; each tap gives three
// measurements (hold, travel, landing point) that gather in a tray; the tray
// closes into a sealed capsule; it travels into the enclave on OutLayer, whose
// code version NEAR records; it opens only inside; the marks settle into the
// fingerprint; nobody outside can read it.
import React from 'react';
import {SceneLabel} from '../components/Chrome';
import {Finger, fingerPath, TapRing} from '../components/Finger';
import {Lock} from '../components/Icons';
import {PhoneLabel, Screen} from '../components/Phone';
import {EnrollScreen, keyCentre} from '../components/Screens';
import {
	Blocked,
	Enclave,
	ENCLAVE_IN,
	FingerprintMap,
	habit,
	mapKey,
	MarkGlyph,
	MarkKind,
	NearPanel,
	SealedNote,
	traySlot,
	TRAY_COL,
} from '../components/Stage';
import {curve, EASE, FONT, Look, mix, ramp, smallCaps, STAGE, Story, useSeconds} from '../theme';
import type {Timeline} from '../timeline';

type Beats = Timeline['scenes']['seal']['beats'];
const KINDS: MarkKind[] = ['hold', 'travel', 'land'];

/** The tray that becomes the capsule: p = 0 open tray, 1 closed orange capsule. */
export const Capsule: React.FC<{look: Look; cx: number; cy: number; p: number; open?: number; opacity?: number; label?: string}> = ({
	look,
	cx,
	cy,
	p,
	open = 0,
	opacity = 1,
	label = 'sealed',
}) => {
	const tray = STAGE.tray;
	const w = mix(tray.w, 176, p);
	const h = mix(tray.h, 68, p);
	const r = mix(18, 34, p);
	const fill = p > 0 ? look.orange : 'transparent';
	const half = (side: -1 | 1) => (
		<div
			style={{
				position: 'absolute',
				left: cx - w / 2 + (side > 0 ? w / 2 : 0) + side * open * 46,
				top: cy - h / 2,
				width: w / 2,
				height: h,
				borderRadius: side < 0 ? `${r}px 0 0 ${r}px` : `0 ${r}px ${r}px 0`,
				background: fill,
				opacity: p * (1 - open),
			}}
		/>
	);
	return (
		<div style={{opacity}}>
			{/* the open tray's outline */}
			<div
				style={{
					position: 'absolute',
					left: cx - w / 2,
					top: cy - h / 2,
					width: w,
					height: h,
					borderRadius: r,
					border: `2.5px solid ${look.orange}`,
					boxSizing: 'border-box',
					opacity: (1 - p) * (1 - open),
				}}
			/>
			{half(-1)}
			{half(1)}
			<div
				style={{
					position: 'absolute',
					left: cx - 70,
					top: cy - 16,
					width: 140,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 8,
					opacity: Math.max(0, p * 2 - 1) * (1 - open),
				}}
			>
				<Lock size={30} color={look.onOrange} stroke={2} open={open} />
				<span style={smallCaps(look.onOrange, 14)}>{label}</span>
			</div>
		</div>
	);
};

export const SealScene: React.FC<{look: Look; story: Story; b: Beats; label: string; phoneLabel: string}> = ({look, story, b, label, phoneLabel}) => {
	const t = useSeconds();
	const letters = [...story.tapLetters.toLowerCase()].filter((l) => /[a-z]/.test(l)).slice(0, 4);
	const tapAt = (i: number) => b.taps + i * b.tapEvery;
	const taps = letters.map((l, i) => ({at: tapAt(i), pt: keyCentre(l)}));
	const finger = fingerPath(t, taps, [640, 1180]);
	// The field holds the answer up to the tapped letters, which the finger types (they are its last letters).
	const tail = letters.join('');
	const full = story.enrollText;
	const prefix = full.toLowerCase().endsWith(tail) ? full.slice(0, full.length - tail.length) : full + ' ';
	const fieldText = prefix + letters.filter((_, i) => t >= tapAt(i)).map((l, i) => full.slice(prefix.length + i, prefix.length + i + 1) || l).join('');
	const pressed: Record<string, number> = {};
	letters.forEach((l, i) => {
		if (t >= tapAt(i) - 0.02 && t < tapAt(i) + 0.26) pressed[l] = 1;
	});

	const trayIn = ramp(t, b.taps - 0.5, 0.5);
	const pack = ramp(t, b.pack, 1.4);
	const trayC: [number, number] = [STAGE.tray.x + STAGE.tray.w / 2, STAGE.tray.y + STAGE.tray.h / 2];
	const go = ramp(t, b.travel, b.arrive - b.travel, EASE);
	const dock = ENCLAVE_IN.dock;
	const capsulePt = curve(trayC, [mix(trayC[0], dock[0], 0.5), trayC[1] + 120], dock, go);
	const open = ramp(t, b.open, 0.8);
	const settleP = (i: number, k: number) => ramp(t, b.settle + i * 0.25 + k * 0.08, 1.1, EASE);
	const fill = ramp(t, b.fill, 2.2, EASE);
	const freshFade = 1 - ramp(t, b.fill + 1.4, 1.2);
	const fresh: Record<string, number> = {};
	letters.forEach((l, i) => {
		if (settleP(i, 2) >= 1) fresh[l] = freshFade;
	});
	const code = ramp(t, b.code, 0.6);
	const codeOk = ramp(t, b.code + 1.2, 0.5);
	const sealed = ramp(t, b.sealed, 0.8);

	return (
		<>
			<Screen>
				<EnrollScreen look={look} story={story} text={fieldText} pressed={pressed} />
			</Screen>
			<PhoneLabel look={look} text={phoneLabel} />
			<NearPanel look={look} story={story} opacity={1} keyRow={1} codeRow={code} codeHi={code * (1 - ramp(t, b.open, 0.6))} />
			{/* NEAR holds the code version the enclave runs */}
			<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, opacity: code * (1 - ramp(t, b.open, 0.6))}}>
				<line x1={1430} y1={STAGE.near.y + STAGE.near.h} x2={1430} y2={STAGE.enclave.y} stroke={look.orange} strokeWidth={2.5} strokeDasharray="6 6" />
			</svg>
			<Enclave look={look} story={story} opacity={ramp(t, b.enclave, 0.7)} sealed={sealed} codeOk={codeOk}>
				<div style={{position: 'absolute', left: ENCLAVE_IN.map.x - STAGE.enclave.x, top: ENCLAVE_IN.map.y - STAGE.enclave.y + 3 * 50 + 6, ...smallCaps(look.ink2, 12)}}>
					Your typing fingerprint{fill > 0.05 ? ' · 3 sessions' : ''}
				</div>
			</Enclave>
			<FingerprintMap look={look} fill={fill} fresh={fresh} />
			{/* new travel arcs between the tapped keys */}
			<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
				{letters.slice(1).map((l, i) => {
					const a = mapKey(letters[i]);
					const c = mapKey(l);
					const p = settleP(i + 1, 1);
					if (p < 1) return null;
					return (
						<path
							key={l + i}
							d={`M${a.cx} ${a.cy} Q${(a.cx + c.cx) / 2} ${Math.min(a.cy, c.cy) - 26} ${c.cx} ${c.cy}`}
							fill="none"
							stroke={freshFade > 0.01 ? look.orange : look.minor}
							strokeWidth={2}
							opacity={mix(0.55, 1, freshFade)}
						/>
					);
				})}
			</svg>
			{/* the tray's column names */}
			<div style={{opacity: trayIn * (1 - pack)}}>
				{(['hold', 'travel', 'land'] as const).map((k) => (
					<div key={k} style={{position: 'absolute', left: STAGE.tray.x + TRAY_COL[k] - 50, width: 100, top: STAGE.tray.y - 26, textAlign: 'center', ...smallCaps(look.ink, 12)}}>
						{k === 'land' ? 'landing' : k}
					</div>
				))}
			</div>
			<Capsule look={look} cx={capsulePt[0]} cy={capsulePt[1]} p={pack} open={open} opacity={trayIn * (1 - ramp(t, b.open + 0.6, 0.4))} />
			{/* the measurements: from the key to the tray, packed, carried, then out into the fingerprint */}
			{letters.map((l, i) => {
				const born = tapAt(i) + 0.05;
				if (t < born) return null;
				const [kx, ky] = keyCentre(l);
				return (
					<React.Fragment key={l + i}>
						<div
							style={{
								position: 'absolute',
								left: traySlot(i, 'letter')[0] - 14,
								top: traySlot(i, 'letter')[1] - 14,
								width: 28,
								height: 28,
								borderRadius: 7,
								background: look.tile,
								fontFamily: FONT,
								fontSize: 17,
								fontWeight: 400,
								color: look.ink,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								opacity: ramp(t, born + 0.3, 0.3) * (1 - pack),
							}}
						>
							{l}
						</div>
						{KINDS.map((kind, k) => {
							const fly = ramp(t, born + k * 0.08, 0.75, EASE);
							const slot = traySlot(i, kind);
							let pt = curve([kx, ky], [mix(kx, slot[0], 0.5), Math.min(ky, slot[1]) - 90], slot, fly);
							let scale = mix(1.25, 1, fly);
							let opacity = 1;
							// packed: pulled into the capsule's middle, shrinking
							if (pack > 0) {
								pt = [mix(pt[0], trayC[0], pack), mix(pt[1], trayC[1], pack)];
								scale *= mix(1, 0.35, pack);
								opacity = 1 - ramp(t, b.pack + 0.7, 0.5);
							}
							// opened inside: out of the capsule into the fingerprint
							const s = settleP(i, k);
							if (t >= b.open + 0.2) {
								const key = mapKey(l);
								const hb = habit(l);
								const prev = i > 0 ? mapKey(letters[i - 1]) : null;
								const target: [number, number] =
									kind === 'land'
										? [key.cx + hb.dx * key.w, key.cy + hb.dy * key.h]
										: kind === 'hold'
											? [key.x + key.w / 2, key.y + key.h - 6]
											: prev
												? [(prev.cx + key.cx) / 2, Math.min(prev.cy, key.cy) - 16]
												: [key.cx, key.cy - 30];
								const start: [number, number] = [dock[0] + (k - 1) * 40, dock[1] + (i - 1.5) * 16];
								pt = curve(start, [mix(start[0], target[0], 0.5), Math.min(start[1], target[1]) - 60], target, s);
								scale = mix(0.9, 0.6, s);
								opacity = ramp(t, b.open + 0.2, 0.3) * (1 - ramp(t, b.settle + i * 0.25 + k * 0.08 + 1.0, 0.25));
							}
							if (opacity <= 0) return null;
							return (
								<div
									key={kind}
									style={{
										position: 'absolute',
										left: pt[0],
										top: pt[1],
										transform: `translate(-50%, -50%) scale(${scale})`,
										opacity,
									}}
								>
									<MarkGlyph look={look} kind={kind} letter={l} />
								</div>
							);
						})}
					</React.Fragment>
				);
			})}
			{taps.map((k) => (
				<TapRing key={k.at} look={look} pt={k.pt} t={t} at={k.at} />
			))}
			<Finger look={look} {...finger} />
			<SealedNote look={look} opacity={ramp(t, b.sealed, 0.6)} />
			<Blocked look={look} p={ramp(t, b.sealed + 0.3, 1.8, (x) => x)} />
			<SceneLabel look={look} number={3} text={label} />
		</>
	);
};
