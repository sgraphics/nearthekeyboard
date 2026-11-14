// "How NTK works": one still, 1600 x 900, for the thread on X. Four steps from
// left to right, as in the post: type, seal, sign, check. A word or two per step.
//   npx remotion still Architecture ../out/ntk-how-it-works.png
import React from 'react';
import {AbsoluteFill, Still} from 'remotion';
import {Mark} from './components/Chrome';
import {Chip as ChipIcon, Key, Lock} from './components/Icons';
import {KB, Keyboard, Strip} from './components/Screens';
import {FONT, Look, SCREEN, SHADOW, smallCaps} from './theme';

const LOOK: Look = {
	background: '#E6EAF2',
	panel: '#F3F6FC',
	tile: '#ECEFF6',
	tileDown: '#E2E6EE',
	ink: '#000000',
	ink2: '#545C72',
	minor: '#8E98B1',
	line: '#BDC3D3',
	orange: '#FD5B15',
	onOrange: '#FFFFFF',
	green: '#1E9E5A',
	phoneBody: '#1D2026',
	captionSize: 46,
	captionWeight: 400,
	titleWeight: 200,
};

const W = 1600;
const H = 900;
const TILE = {w: 324, h: 520, y: 276, gap: 48};
const LEFT = (W - (4 * TILE.w + 3 * TILE.gap)) / 2;
const ART = {y: 92, h: 250}; // the picture area inside a tile
const STAMP = 'c5682ebadf';

/** The NTK keyboard, its strip and keys, scaled into a tile, one key pressed. */
const MiniKeyboard: React.FC = () => {
	const top = KB.stripY;
	const h = KB.rowY[3] + KB.keyH + 10 - top;
	const scale = (TILE.w - 40) / SCREEN.w;
	return (
		<div style={{position: 'relative', width: SCREEN.w * scale, height: h * scale, borderRadius: 14, overflow: 'hidden', background: LOOK.background, boxShadow: SHADOW}}>
			<div style={{position: 'absolute', left: 0, top: 0, width: SCREEN.w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
				<div style={{position: 'absolute', left: 0, top: -top, width: SCREEN.w, height: SCREEN.h}}>
					<Strip look={LOOK} status="" keyLabel="sign" />
					<Keyboard look={LOOK} pressed={{t: 1}} />
				</div>
			</div>
		</div>
	);
};

const Panel: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
	<div style={{background: LOOK.panel, borderRadius: 16, boxShadow: SHADOW, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...style}}>
		{children}
	</div>
);

const Sealed: React.FC = () => (
	<Panel style={{width: 230, height: 220, gap: 18}}>
		<Lock size={84} color={LOOK.ink} stroke={1.2} />
		<div style={{display: 'flex', alignItems: 'center', gap: 8}}>
			<ChipIcon size={22} color={LOOK.ink2} stroke={1.4} />
			<span style={smallCaps(LOOK.ink2, 13)}>Intel TDX</span>
		</div>
	</Panel>
);

const Signed: React.FC = () => (
	<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26}}>
		<Panel style={{width: 112, height: 112, borderRadius: 56}}>
			<Key size={58} color={LOOK.orange} stroke={1.4} />
		</Panel>
		<Panel style={{flexDirection: 'row', gap: 10, padding: '16px 20px', borderRadius: 12}}>
			<span style={{width: 9, height: 9, borderRadius: 5, background: LOOK.green}} />
			<span style={{...smallCaps(LOOK.green, 14)}}>Match</span>
			<span style={{fontFamily: FONT, fontSize: 18, fontWeight: 400, color: LOOK.ink}}>[NTK {STAMP}]</span>
		</Panel>
	</div>
);

const Checked: React.FC = () => (
	<Panel style={{width: 264, height: 200, alignItems: 'flex-start', justifyContent: 'flex-start', padding: '22px 24px', gap: 14}}>
		<span style={{fontFamily: FONT, fontSize: 17, fontWeight: 400, color: LOOK.ink2}}>ntk.tools/{STAMP}</span>
		<div style={{display: 'flex', alignItems: 'center', gap: 12, marginTop: 6}}>
			<span style={{width: 14, height: 14, borderRadius: 7, background: LOOK.green}} />
			<span style={{fontFamily: FONT, fontSize: 54, fontWeight: 200, letterSpacing: '-0.01em', color: LOOK.green, lineHeight: 1}}>MATCH</span>
		</div>
	</Panel>
);

const STEPS: {word: string; art: React.ReactNode; lines: string[]}[] = [
	{word: 'Type', art: <MiniKeyboard />, lines: ['Your typing is', 'your handwriting.']},
	{word: 'Seal', art: <Sealed />, lines: ['OutLayer enclave.', 'Nobody can read it.']},
	{word: 'Sign', art: <Signed />, lines: ['Same handwriting?', 'The enclave stamps.']},
	{word: 'Check', art: <Checked />, lines: ['Anyone, at ntk.tools.', 'A hash, never the text.']},
];

/** A thin arrow in the gap between two tiles. */
const Arrow: React.FC<{x: number; y: number}> = ({x, y}) => (
	<svg width={TILE.gap} height={20} viewBox={`0 0 ${TILE.gap} 20`} style={{position: 'absolute', left: x, top: y - 10}}>
		<path d={`M8 10 H${TILE.gap - 9} M${TILE.gap - 15} 4 L${TILE.gap - 9} 10 L${TILE.gap - 15} 16`} fill="none" stroke={LOOK.minor} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

export const Architecture: React.FC = () => (
	<AbsoluteFill style={{background: LOOK.background, fontFamily: FONT}}>
		<Mark height={30} style={{position: 'absolute', left: LEFT, top: 96}} />
		<div style={{position: 'absolute', left: LEFT, top: 146, fontSize: 64, fontWeight: 200, letterSpacing: '-0.015em', color: LOOK.ink, lineHeight: 1}}>
			How NTK works
		</div>
		{STEPS.map((s, i) => {
			const x = LEFT + i * (TILE.w + TILE.gap);
			return (
				<React.Fragment key={s.word}>
					<div style={{position: 'absolute', left: x, top: TILE.y, width: TILE.w, height: TILE.h, background: LOOK.tile, borderRadius: 22, boxShadow: SHADOW}}>
						<div style={{position: 'absolute', left: 28, top: 30, display: 'flex', alignItems: 'baseline', gap: 14}}>
							<span style={smallCaps(LOOK.orange, 16)}>{String(i + 1).padStart(2, '0')}</span>
							<span style={smallCaps(LOOK.ink, 16)}>{s.word}</span>
						</div>
						<div style={{position: 'absolute', left: 0, top: ART.y, width: TILE.w, height: ART.h, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
							{s.art}
						</div>
						<div style={{position: 'absolute', left: 28, right: 24, top: ART.y + ART.h + 44, fontSize: 25, fontWeight: 300, lineHeight: 1.4, color: LOOK.ink}}>
							{s.lines.map((l) => (
								<div key={l}>{l}</div>
							))}
						</div>
					</div>
					{i < STEPS.length - 1 ? <Arrow x={x + TILE.w} y={TILE.y + ART.y + ART.h / 2} /> : null}
				</React.Fragment>
			);
		})}
	</AbsoluteFill>
);

export const ArchitectureStill: React.FC = () => <Still id="Architecture" component={Architecture} width={W} height={H} />;
