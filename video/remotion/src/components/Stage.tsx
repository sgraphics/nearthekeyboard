// The players of the animations and what moves between them: NEAR (top), the
// OutLayer enclave (centre), public storage and "anyone" (right), the tray
// where a tap's measurements gather, the sealed capsule, the fingerprint, the
// dial, the stamp. Positions come from STAGE in theme.ts.
import React from 'react';
import {Look, FONT, SHADOW, STAGE, smallCaps, Story, hash01, mix} from '../theme';
import {Check, Chip as ChipIcon, Cross, EyeOff, Key, Lock, Records, Search} from './Icons';

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({position: 'absolute', left: x, top: y, ...extra});

export const Panel: React.FC<{look: Look; box: {x: number; y: number; w: number; h: number}; opacity?: number; children?: React.ReactNode; style?: React.CSSProperties}> = ({
	look,
	box,
	opacity = 1,
	children,
	style,
}) => (
	<div style={abs(box.x, box.y, {width: box.w, height: box.h, borderRadius: 20, background: look.panel, boxShadow: SHADOW, opacity, ...style})}>{children}</div>
);

const Thin: React.FC<{look: Look; size: number; weight?: number; color?: string; children: React.ReactNode; style?: React.CSSProperties}> = ({
	look,
	size,
	weight,
	color,
	children,
	style,
}) => <div style={{fontFamily: FONT, fontSize: size, fontWeight: weight ?? look.titleWeight, color: color ?? look.ink, lineHeight: 1.15, whiteSpace: 'nowrap', ...style}}>{children}</div>;

// ---- NEAR ---------------------------------------------------------------

/** NEAR at the top: the account with its keys, and the code versions OutLayer may run for NTK. */
export const NearPanel: React.FC<{
	look: Look;
	story: Story;
	opacity: number;
	keyRow: number;
	keyHi?: number;
	keyOk?: number;
	codeRow?: number;
	codeHi?: number;
}> = ({look, story, opacity, keyRow, keyHi = 0, keyOk = 0, codeRow = 0, codeHi = 0}) => {
	const b = STAGE.near;
	return (
		<Panel look={look} box={b} opacity={opacity}>
			<div style={abs(28, 22, {display: 'flex', alignItems: 'baseline', gap: 12})}>
				<span style={smallCaps(look.ink, 16)}>NEAR</span>
			</div>
			<Thin look={look} size={30} style={abs(28, 54)}>
				{story.account}
			</Thin>
			<div
				style={abs(18, 104, {
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '3px 10px',
					borderRadius: 8,
					fontFamily: FONT,
					fontSize: 16,
					color: look.ink,
					opacity: keyRow,
					boxShadow: keyHi > 0 ? `inset 0 0 0 ${2 * keyHi}px ${look.orange}` : undefined,
				})}
			>
				<Key size={24} color={look.orange} stroke={2} />
				<span>function-call key</span>
				<span style={{opacity: keyOk, display: 'flex', alignItems: 'center', gap: 4, color: look.green, fontWeight: 500}}>
					<Check size={22} color={look.green} stroke={2.2} /> yours
				</span>
			</div>
			<div style={{opacity: codeRow}}>
				<div style={abs(640, 26, smallCaps(look.ink2, 12))}>Active code</div>
				<div
					style={abs(630, 50, {
						padding: '6px 10px',
						borderRadius: 8,
						boxShadow: codeHi > 0 ? `inset 0 0 0 ${2 * codeHi}px ${look.orange}` : undefined,
					})}
				>
					<div style={{fontFamily: FONT, fontSize: 24, fontWeight: 500, color: look.ink, letterSpacing: '0.02em'}}>{story.codeVersion}…</div>
				</div>
			</div>
		</Panel>
	);
};
/** Where the function-call key's icon sits in the NEAR panel, on the frame. */
export const nearKeyIcon = (): [number, number] => [STAGE.near.x + 18 + 10 + 12, STAGE.near.y + 104 + 3 + 12];

// ---- the enclave ----------------------------------------------------------

export const ENCLAVE_IN = {
	map: {x: STAGE.enclave.x + 38, y: STAGE.enclave.y + 118},
	dialY: STAGE.enclave.y + 330,
	cardY: STAGE.enclave.y + 420,
	/** where a capsule stops inside, on the frame */
	dock: [STAGE.enclave.x + STAGE.enclave.w / 2, STAGE.enclave.y + 372] as [number, number],
};

/** The enclave's box: a double wall (the NTK mark's double line), the name, the TDX chip. */
export const Enclave: React.FC<{look: Look; opacity: number; sealed?: number; codeOk?: number; story: Story; children?: React.ReactNode}> = ({
	look,
	opacity,
	sealed = 0,
	codeOk = 0,
	story,
	children,
}) => {
	const b = STAGE.enclave;
	const wall = sealed > 0 ? look.ink : look.ink2;
	const wallW = mix(2.5, 3.5, sealed);
	return (
		<div style={abs(b.x, b.y, {width: b.w, height: b.h, opacity})}>
			<div style={abs(0, 0, {width: b.w, height: b.h, borderRadius: 28, background: look.panel, boxShadow: SHADOW})} />
			<div style={abs(0, 0, {width: b.w, height: b.h, borderRadius: 28, border: `${wallW}px solid ${wall}`, boxSizing: 'border-box'})} />
			<div style={abs(9, 9, {width: b.w - 18, height: b.h - 18, borderRadius: 20, border: `${wallW}px solid ${wall}`, boxSizing: 'border-box'})} />
			<div style={abs(34, 32, {display: 'flex', alignItems: 'center', gap: 12})}>
				<Lock size={30} color={look.ink} stroke={1.8} open={0} />
				<Thin look={look} size={30}>
					OutLayer enclave
				</Thin>
			</div>
			<div style={abs(b.w - 34 - 150, 34, {width: 150, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8})}>
				<ChipIcon size={24} color={look.ink} />
				<span style={smallCaps(look.ink, 14)}>Intel TDX</span>
			</div>
			<div style={abs(36, 76, {display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 15, color: look.ink2, opacity: codeOk})}>
				<Check size={20} color={look.green} stroke={2.2} />
				code {story.codeVersion}…
			</div>
			{children}
		</div>
	);
};

// ---- the fingerprint --------------------------------------------------------

const MAP = {key: 44, gap: 6};
const MAP_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
/** A key's box on the fingerprint map, in frame coordinates. */
export const mapKey = (l: string) => {
	const r = MAP_ROWS.findIndex((row) => row.includes(l));
	const i = MAP_ROWS[Math.max(0, r)].indexOf(l);
	const offset = r === 1 ? 0.5 : r === 2 ? 1.5 : 0;
	const x = ENCLAVE_IN.map.x + (offset + i) * (MAP.key + MAP.gap);
	const y = ENCLAVE_IN.map.y + Math.max(0, r) * (MAP.key + MAP.gap);
	return {x, y, w: MAP.key, h: MAP.key, cx: x + MAP.key / 2, cy: y + MAP.key / 2};
};
/** A person's habits per key: where the finger lands (dx, dy as fractions) and how long a key is held (ms). */
export const habit = (l: string) => ({
	dx: (hash01('dx' + l) - 0.5) * 0.45,
	dy: (hash01('dy' + l) - 0.35) * 0.4,
	hold: 70 + Math.round(hash01('hold' + l) * 60),
	travel: 90 + Math.round(hash01('travel' + l) * 140),
});
const PAIRS = ['th', 'he', 'in', 'er', 'an', 're', 'on', 'nd', 'ou', 'is'];

/** The fingerprint: per key, a cloud of landing points and a bar for the hold; arcs for frequent moves. */
export const FingerprintMap: React.FC<{
	look: Look;
	/** how much of the stored profile shows (0..1), key by key */
	fill: number;
	/** keys whose new marks are shown in orange, with how strongly (0..1) */
	fresh?: Record<string, number>;
	/** the new typing laid over the map in orange (stamp scene), 0..1 */
	overlay?: number;
	overlayKeys?: string;
}> = ({look, fill, fresh = {}, overlay = 0, overlayKeys = ''}) => {
	const letters = MAP_ROWS.join('');
	const first = mapKey('q');
	const last = mapKey('p');
	const w = last.x + last.w - first.x;
	const h = 3 * MAP.key + 2 * MAP.gap;
	const order = [...letters].sort((a, b) => hash01('o' + a) - hash01('o' + b));
	const shown = (l: string) => Math.max(0, Math.min(1, fill * (letters.length + 4) - order.indexOf(l)));
	const dots = (l: string, color: string, alpha: number, n: number, seed: string) => {
		const k = mapKey(l);
		const hb = habit(l);
		return Array.from({length: n}, (_, i) => {
			const a = hash01(seed + l + i) * Math.PI * 2;
			const r = hash01(seed + 'r' + l + i) * 6;
			return (
				<circle key={seed + l + i} cx={k.cx - first.x + hb.dx * k.w + Math.cos(a) * r} cy={k.cy - first.y + hb.dy * k.h + Math.sin(a) * r} r={2.1} fill={color} opacity={alpha} />
			);
		});
	};
	return (
		<svg width={w + 20} height={h + 40} style={abs(first.x - 10, first.y - 30, {overflow: 'visible'})} viewBox={`-10 -30 ${w + 20} ${h + 40}`}>
			{[...letters].map((l) => {
				const k = mapKey(l);
				return <rect key={'k' + l} x={k.x - first.x} y={k.y - first.y} width={k.w} height={k.h} rx={8} fill={look.tile} />;
			})}
			{PAIRS.map((p) => {
				const a = mapKey(p[0]);
				const b = mapKey(p[1]);
				const s = Math.min(shown(p[0]), shown(p[1]));
				if (s <= 0) return null;
				const mx = (a.cx + b.cx) / 2 - first.x;
				const my = Math.min(a.cy, b.cy) - first.y - 22 - Math.abs(a.cx - b.cx) * 0.08;
				return <path key={'p' + p} d={`M${a.cx - first.x} ${a.cy - first.y} Q${mx} ${my} ${b.cx - first.x} ${b.cy - first.y}`} fill="none" stroke={look.minor} strokeWidth={1.2} opacity={0.45 * s} />;
			})}
			{[...letters].map((l) => {
				const s = shown(l);
				const f = fresh[l] ?? 0;
				if (s <= 0 && f <= 0) return null;
				const k = mapKey(l);
				const hb = habit(l);
				const barW = ((hb.hold - 40) / 110) * (k.w - 12);
				const c = f > 0 ? look.orange : look.ink;
				return (
					<g key={'d' + l} opacity={Math.max(s, f)}>
						{dots(l, c, 0.75, 7, 'a')}
						<rect x={k.x - first.x + 6} y={k.y - first.y + k.h - 8} width={barW} height={3.5} rx={1.75} fill={c} opacity={0.8} />
					</g>
				);
			})}
			{overlay > 0
				? [...overlayKeys].map((l, i) => {
						const k = mapKey(l);
						const hb = habit(l);
						const o = Math.max(0, Math.min(1, overlay * (overlayKeys.length + 2) - i));
						if (o <= 0) return null;
						return (
							<g key={'o' + l + i} opacity={o}>
								<circle cx={k.cx - first.x + hb.dx * k.w + 2} cy={k.cy - first.y + hb.dy * k.h - 1} r={6} fill="none" stroke={look.orange} strokeWidth={2.2} />
							</g>
						);
					})
				: null}
		</svg>
	);
};

// ---- the dial ---------------------------------------------------------------

/** The site's radio dial: fine ticks on a line from 0 to 100, an orange needle, a heavy mark at what is needed. */
export const Dial: React.FC<{look: Look; x: number; y: number; w: number; value: number; needs: number; opacity: number; readout: string}> = ({
	look,
	x,
	y,
	w,
	value,
	needs,
	opacity,
	readout,
}) => {
	const base = 34;
	const px = (p: number) => (Math.max(0, Math.min(100, p)) / 100) * w;
	const ticks = [];
	for (let p = 0; p <= 100; p += 2) {
		const len = p % 50 === 0 ? 18 : p % 10 === 0 ? 12 : 7;
		ticks.push(<line key={p} x1={px(p)} y1={base - len} x2={px(p)} y2={base} stroke={look.ink} strokeWidth={1.2} />);
	}
	return (
		<div style={abs(x, y, {width: w, opacity})}>
			<svg width={w} height={base + 30} style={{overflow: 'visible', display: 'block'}}>
				<line x1={0} y1={base} x2={w} y2={base} stroke={look.ink} strokeWidth={1.2} />
				{ticks}
				<line x1={px(needs)} y1={4} x2={px(needs)} y2={13} stroke={look.ink} strokeWidth={4} />
				<line x1={px(value)} y1={-2} x2={px(value)} y2={base + 10} stroke={look.orange} strokeWidth={3} />
				{[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
					<text key={n} x={px(n)} y={base + 24} textAnchor="middle" fontFamily={FONT} fontSize={12} fontWeight={300} fill={look.ink}>
						{n}
					</text>
				))}
			</svg>
			<div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 4, fontFamily: FONT, fontSize: 16, color: look.ink2}}>
				<span style={{color: look.ink, fontWeight: 500, fontVariantNumeric: 'tabular-nums'}}>{readout}</span>
			</div>
		</div>
	);
};

// ---- the stamp ----------------------------------------------------------------

/** The stamp record inside the enclave; `signed` draws the signature and the check. */
export const StampCard: React.FC<{look: Look; story: Story; x: number; y: number; opacity: number; signed: number; scale?: number}> = ({
	look,
	story,
	x,
	y,
	opacity,
	signed,
	scale = 1,
}) => (
	<div
		style={abs(x, y, {
			width: 494,
			height: 104,
			borderRadius: 14,
			background: look.background,
			opacity,
			transform: `scale(${scale})`,
			transformOrigin: 'top left',
			padding: '14px 18px',
			boxSizing: 'border-box',
		})}
	>
		<div style={{display: 'flex', alignItems: 'baseline', gap: 12}}>
			<span style={{fontFamily: FONT, fontSize: 24, fontWeight: 500, color: look.ink}}>[NTK {story.stampId}]</span>
		</div>
		<div style={{fontFamily: FONT, fontSize: 15, lineHeight: 1.35, color: look.ink2, marginTop: 10, width: 340, whiteSpace: 'nowrap'}}>
			{story.scorePct} % · text hash only
		</div>
		<div style={abs(380, 12, {display: 'flex', alignItems: 'center', gap: 4, opacity: signed, color: look.green, fontFamily: FONT, fontSize: 15, fontWeight: 600})}>
			<Check size={22} color={look.green} stroke={2.4} /> signed
		</div>
		<svg width={110} height={30} style={abs(376, 46)}>
			<path
				d="M4 22 C14 4 20 4 22 18 S34 26 40 12 S52 4 56 18 S70 24 78 10 S94 8 104 16"
				fill="none"
				stroke={look.ink}
				strokeWidth={1.6}
				strokeDasharray={160}
				strokeDashoffset={160 * (1 - signed)}
			/>
		</svg>
	</div>
);

export const StampKey: React.FC<{look: Look; x: number; y: number; opacity: number; label?: boolean}> = ({look, x, y, opacity, label = true}) => (
	<div style={abs(x - 22, y - 22, {display: 'flex', alignItems: 'center', gap: 10, opacity})}>
		<div style={{width: 44, height: 44, borderRadius: 22, background: look.orange, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
			<Key size={30} color={look.onOrange} stroke={2} />
		</div>
		{label ? <span style={{fontFamily: FONT, fontSize: 16, color: look.ink, whiteSpace: 'nowrap'}}>stamp key</span> : null}
	</div>
);

// ---- storage and readers ------------------------------------------------------------

export const StoragePanel: React.FC<{look: Look; story: Story; opacity: number; stored: number; hi?: number}> = ({look, story, opacity, stored, hi = 0}) => {
	const b = STAGE.storage;
	const row = (id: string, o: number, strong = false) => (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				height: 34,
				padding: '0 10px',
				borderRadius: 8,
				background: strong ? look.background : 'transparent',
				boxShadow: strong && hi > 0 ? `inset 0 0 0 ${2 * hi}px ${look.orange}` : undefined,
				opacity: o,
				fontFamily: FONT,
				fontSize: 15,
				color: strong ? look.ink : look.minor,
				whiteSpace: 'nowrap',
			}}
		>
			stamp:{id}
		</div>
	);
	return (
		<Panel look={look} box={b} opacity={opacity}>
			<div style={abs(22, 22, {display: 'flex', alignItems: 'center', gap: 10})}>
				<Records size={26} color={look.ink} />
				<Thin look={look} size={24}>
					Public storage
				</Thin>
			</div>
			<div style={abs(14, 90, {width: b.w - 28, display: 'flex', flexDirection: 'column', gap: 4})}>
				{row('e65ee28db5', 1)}
				{row('85218caaa0', 1)}
				{row(story.stampId, stored, true)}
			</div>
		</Panel>
	);
};
export const storageSlot = (): [number, number] => [STAGE.storage.x + STAGE.storage.w / 2, STAGE.storage.y + 90 + 2 * 38 + 17];

export const ReaderPanel: React.FC<{look: Look; story: Story; opacity: number; looking: number; match: number}> = ({look, story, opacity, looking, match}) => {
	const b = STAGE.reader;
	return (
		<Panel look={look} box={b} opacity={opacity}>
			<div style={abs(22, 22, {display: 'flex', alignItems: 'center', gap: 10})}>
				<Search size={26} color={look.ink} />
				<Thin look={look} size={24}>
					Anyone
				</Thin>
			</div>
			<div style={abs(24, 88, {width: b.w - 48, fontFamily: FONT, fontSize: 14.5, lineHeight: 1.4, color: look.ink, opacity: Math.max(0.0001, looking)})}>
				“{story.reply}” <span style={{whiteSpace: 'nowrap'}}>[NTK {story.stampId}]</span>
			</div>
			<div style={abs(24, 166, {display: 'flex', alignItems: 'center', gap: 8, opacity: match})}>
				<span style={{fontFamily: FONT, fontSize: 30, fontWeight: 600, letterSpacing: '0.02em', color: look.green}}>MATCH</span>
				<Check size={30} color={look.green} stroke={2.4} />
			</div>
		</Panel>
	);
};
export const readerEdge = (): [number, number] => [STAGE.reader.x + STAGE.reader.w / 2, STAGE.reader.y];

/** Those who cannot read the fingerprint, each stopped at the enclave's wall. */
export const Blocked: React.FC<{look: Look; p: number}> = ({look, p}) => {
	const who = ['us', 'OutLayer', 'you'];
	const x0 = STAGE.storage.x + 20;
	const wallX = STAGE.enclave.x + STAGE.enclave.w;
	return (
		<>
			{who.map((w, i) => {
				const o = Math.max(0, Math.min(1, p * 4 - i));
				const y = STAGE.enclave.y + 140 + i * 110;
				return (
					<div key={w} style={{opacity: o}}>
						<svg width={x0 - wallX + 4} height={30} style={abs(wallX - 2, y - 15)}>
							<line x1={x0 - wallX} y1={15} x2={18} y2={15} stroke={look.ink2} strokeWidth={2} strokeDasharray="5 5" />
						</svg>
						<Cross size={22} color={look.orange} stroke={2.6} style={abs(wallX + 2, y - 11)} />
						<div style={abs(x0, y - 22, {display: 'flex', alignItems: 'center', gap: 10})}>
							<EyeOff size={34} color={look.ink} stroke={1.6} />
							<Thin look={look} size={22} weight={300}>
								{w}
							</Thin>
						</div>
					</div>
				);
			})}
		</>
	);
};

// ---- a tap's measurements, the tray, the capsule ----------------------------------------

export type MarkKind = 'hold' | 'travel' | 'land';

/** One measurement, drawn small: a bar (hold), an arc (travel), a point in a key (landing). */
export const MarkGlyph: React.FC<{look: Look; kind: MarkKind; letter: string; color?: string; scale?: number}> = ({look, kind, letter, color, scale = 1}) => {
	const c = color ?? look.orange;
	const hb = habit(letter);
	if (kind === 'hold') {
		const w = 18 + ((hb.hold - 60) / 80) * 46;
		return (
			<svg width={66 * scale} height={16 * scale} viewBox="0 0 66 16" style={{display: 'block', overflow: 'visible'}}>
				<rect x={0} y={4} width={w} height={8} rx={4} fill={c} />
			</svg>
		);
	}
	if (kind === 'travel') {
		const span = 26 + ((hb.travel - 90) / 140) * 26;
		return (
			<svg width={56 * scale} height={24 * scale} viewBox="0 0 56 24" style={{display: 'block', overflow: 'visible'}}>
				<path d={`M2 20 Q${2 + span / 2} -6 ${2 + span} 20`} fill="none" stroke={c} strokeWidth={3} strokeLinecap="round" />
				<path d={`M${span - 4} 13 L${2 + span} 20 L${span + 7} 12`} fill="none" stroke={c} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		);
	}
	return (
		<svg width={32 * scale} height={32 * scale} viewBox="0 0 32 32" style={{display: 'block', overflow: 'visible'}}>
			<rect x={1.5} y={1.5} width={29} height={29} rx={6} fill="none" stroke={look.minor} strokeWidth={1.5} />
			<path d="M16 9 v14 M9 16 h14" stroke={look.line} strokeWidth={1} />
			<circle cx={16 + hb.dx * 24} cy={16 + hb.dy * 24} r={4.5} fill={c} />
		</svg>
	);
};

/** Column centres in the tray, from its left edge. */
export const TRAY_COL = {letter: 28, hold: 82, travel: 158, land: 228};
/** Where a tap's mark sits in the tray: row i, on the frame. */
export const traySlot = (row: number, kind: MarkKind | 'letter'): [number, number] => [STAGE.tray.x + TRAY_COL[kind], STAGE.tray.y + 40 + row * 44];

// ---- the login's key, and the sealed store ------------------------------------------

export const KEY_CARD = {x: 1000, y: 372, w: 600, h: 256};
/** Where the key's badge sits on the key card, on the frame. */
export const keyCardBadge = (): [number, number] => [KEY_CARD.x + 32 + 28, KEY_CARD.y + 32 + 28];

/** The key the wallet added: what it can and cannot do, and where it lives. */
export const KeyCard: React.FC<{look: Look; opacity: number; badge?: boolean}> = ({look, opacity, badge = true}) => {
	const line = (text: string, y: number) => (
		<div style={abs(120, y, {fontFamily: FONT, fontSize: 21, color: look.ink, whiteSpace: 'nowrap'})}>{text}</div>
	);
	return (
		<Panel look={look} box={KEY_CARD} opacity={opacity} style={{transform: `translateY(${(1 - opacity) * 14}px)`}}>
			<div style={abs(32, 32, {width: 56, height: 56, borderRadius: 28, background: look.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: badge ? 1 : 0})}>
				<Key size={36} color={look.onOrange} stroke={2} />
			</div>
			<div style={abs(120, 34, {fontFamily: FONT, fontSize: 30, fontWeight: look.titleWeight, color: look.ink})}>Function-call key</div>
			{line('Talks only to NTK', 104)}
			{line('Cannot move tokens', 146)}
		</Panel>
	);
};

/** At the foot of the enclave: the fingerprint is stored sealed, and nothing returns it. */
export const SealedNote: React.FC<{look: Look; opacity: number}> = ({look, opacity}) => (
	<div
		style={abs(ENCLAVE_IN.map.x, ENCLAVE_IN.cardY + 8, {
			width: 494,
			display: 'flex',
			alignItems: 'center',
			gap: 14,
			padding: '16px 18px',
			borderRadius: 14,
			background: look.background,
			boxSizing: 'border-box',
			opacity,
		})}
	>
		<Lock size={30} color={look.ink} stroke={1.8} />
		<div style={{fontFamily: FONT, fontSize: 19, lineHeight: 1.3, color: look.ink}}>Stored sealed</div>
	</div>
);
