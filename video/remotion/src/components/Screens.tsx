// Drawn phone screens for the animations, in the app's look (flat #E6EAF2
// screen, #F3F6FC strip and fields, #ECEFF6 keys, thin black type, the orange
// key with white text). Coordinates are the screen's own (384 x 862).
import React from 'react';
import {FONT, Look, SCREEN, smallCaps, Story} from '../theme';
import {Mark} from './Chrome';

export const KB = {stripY: 452, stripH: 52, rowY: [514, 578, 642, 706], keyH: 52, margin: 4, gap: 6};
const UNIT = (SCREEN.w - 2 * KB.margin - 9 * KB.gap) / 10;
const ux = (u: number) => KB.margin + u * (UNIT + KB.gap);
const uw = (u: number) => u * UNIT + (u - 1) * KB.gap;

export type KeyRect = {id: string; label: string; x: number; y: number; w: number; h: number; fn?: boolean};

/** Every key of the drawn keyboard, in screen coordinates. */
export const KEYS: KeyRect[] = (() => {
	const keys: KeyRect[] = [];
	const row = (letters: string, y: number, offset: number) =>
		[...letters].forEach((l, i) => keys.push({id: l, label: l, x: ux(offset + i), y, w: UNIT, h: KB.keyH}));
	row('qwertyuiop', KB.rowY[0], 0);
	row('asdfghjkl', KB.rowY[1], 0.5);
	keys.push({id: 'shift', label: '⇧', x: ux(0), y: KB.rowY[2], w: uw(1.5), h: KB.keyH, fn: true});
	row('zxcvbnm', KB.rowY[2], 1.5);
	keys.push({id: 'bksp', label: '⌫', x: ux(8.5), y: KB.rowY[2], w: uw(1.5), h: KB.keyH, fn: true});
	keys.push({id: 'sym', label: '?123', x: ux(0), y: KB.rowY[3], w: uw(1.5), h: KB.keyH, fn: true});
	keys.push({id: ',', label: ',', x: ux(1.5), y: KB.rowY[3], w: uw(1), h: KB.keyH});
	keys.push({id: ' ', label: '', x: ux(2.5), y: KB.rowY[3], w: uw(5), h: KB.keyH});
	keys.push({id: '.', label: '.', x: ux(7.5), y: KB.rowY[3], w: uw(1), h: KB.keyH});
	keys.push({id: 'enter', label: '↵', x: ux(8.5), y: KB.rowY[3], w: uw(1.5), h: KB.keyH, fn: true});
	return keys;
})();

export const keyRect = (id: string) => KEYS.find((k) => k.id === id) ?? KEYS[0];
/** A key's centre on the frame. */
export const keyCentre = (id: string): [number, number] => {
	const k = keyRect(id);
	return [SCREEN.x + k.x + k.w / 2, SCREEN.y + k.y + k.h / 2];
};

/** The orange key at the right of the strip, in screen coordinates. */
export const STRIP_KEY = {x: 272, y: KB.stripY + 8, w: 104, h: KB.stripH - 16};
export const stripKeyCentre = (): [number, number] => [SCREEN.x + STRIP_KEY.x + STRIP_KEY.w / 2, SCREEN.y + STRIP_KEY.y + STRIP_KEY.h / 2];

const abs = (x: number, y: number, extra: React.CSSProperties = {}): React.CSSProperties => ({position: 'absolute', left: x, top: y, ...extra});

export const StatusBar: React.FC<{look: Look}> = ({look}) => (
	<>
		<div style={abs(26, 16, {fontFamily: FONT, fontSize: 14, fontWeight: 500, color: look.ink})}>12:00</div>
		<svg style={abs(318, 17)} width={44} height={14} viewBox="0 0 44 14">
			<path d="M1 5 Q8 -1 15 5 L8 13 Z" fill={look.ink} />
			<rect x="24" y="2" width="16" height="10" rx="2" fill="none" stroke={look.ink} strokeWidth="1.4" />
			<rect x="26" y="4" width="12" height="6" rx="1" fill={look.ink} />
		</svg>
	</>
);

/** The app's header: the mark at the left, the page's name at the right. */
export const AppHeader: React.FC<{look: Look; page: string}> = ({look, page}) => (
	<div style={abs(0, 38, {width: SCREEN.w, height: 62, background: look.panel})}>
		<Mark height={17} style={{position: 'absolute', left: 22, top: 22}} />
		<div style={abs(0, 13, {width: SCREEN.w - 22, textAlign: 'right', fontFamily: FONT, fontSize: 17, fontWeight: 200, color: look.ink})}>{page}</div>
		<div style={abs(0, 37, {width: SCREEN.w - 22, textAlign: 'right', ...smallCaps(look.ink, 8.5)})}>Near the keyboard</div>
	</div>
);

export const NavHandle: React.FC = () => <div style={abs(SCREEN.w / 2 - 60, SCREEN.h - 16, {width: 120, height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.78)'})} />;

/** The app's meter while a call runs: 41 even ticks (a long one every quarter), no numbers, an orange needle. */
const StripMeter: React.FC<{look: Look; value: number}> = ({look, value}) => {
	const w = 176;
	return (
		<svg width={w} height={26} style={abs(80, 13)}>
			<line x1={0} y1={20} x2={w} y2={20} stroke={look.ink} strokeWidth={1} />
			{Array.from({length: 41}, (_, i) => {
				const x = 0.5 + (i * (w - 1)) / 40;
				const len = i % 10 === 0 ? 9 : 5;
				return <line key={i} x1={x} y1={20 - len} x2={x} y2={20} stroke={look.ink} strokeWidth={1} />;
			})}
			<line x1={0.5 + value * (w - 1)} y1={0} x2={0.5 + value * (w - 1)} y2={24} stroke={look.orange} strokeWidth={2} />
		</svg>
	);
};

/** The NTK strip above the keys: the mark, a status line (or the meter while a call runs), the orange key. */
export const Strip: React.FC<{look: Look; status: React.ReactNode; keyLabel: string; keyPressed?: boolean; statusDot?: string; meter?: number | null}> = ({
	look,
	status,
	keyLabel,
	keyPressed,
	statusDot,
	meter = null,
}) => (
	<div style={abs(0, KB.stripY, {width: SCREEN.w, height: KB.stripH, background: look.panel})}>
		<Mark height={16} style={{position: 'absolute', left: 14, top: 18}} />
		{meter === null ? (
			<>
				{status ? <div style={abs(80, 23, {width: 6, height: 6, borderRadius: 3, background: statusDot ?? look.orange})} /> : null}
				<div
					style={abs(94, 16, {
						width: 170,
						fontFamily: FONT,
						fontSize: 12.5,
						fontWeight: 400,
						color: look.ink2,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						lineHeight: '20px',
					})}
				>
					{status}
				</div>
			</>
		) : (
			<StripMeter look={look} value={meter} />
		)}
		<div
			style={abs(STRIP_KEY.x, STRIP_KEY.y - KB.stripY, {
				width: STRIP_KEY.w,
				height: STRIP_KEY.h,
				borderRadius: 9,
				background: keyPressed ? '#E54E0E' : look.orange,
				color: look.onOrange,
				fontFamily: FONT,
				fontSize: 16,
				fontWeight: 500,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 2,
				transform: keyPressed ? 'translateY(1px)' : undefined,
			})}
		>
			<span style={{lineHeight: 1}}>{keyLabel}</span>
			{meter === null ? (
				<svg width={64} height={5} style={{display: 'block'}}>
					{Array.from({length: 17}, (_, i) => (
						<line key={i} x1={0.5 + i * 3.9} y1={0} x2={0.5 + i * 3.9} y2={i % 4 === 0 ? 5 : 3} stroke={look.onOrange} strokeWidth={1} opacity={0.85} />
					))}
				</svg>
			) : null}
		</div>
	</div>
);

/** While a call runs, the keys sit under a veil in the background colour: typing is held. */
export const KeyVeil: React.FC<{look: Look; opacity: number}> = ({look, opacity}) =>
	opacity > 0 ? (
		<div style={abs(0, KB.rowY[0] - 6, {width: SCREEN.w, height: KB.rowY[3] + KB.keyH + 6 - (KB.rowY[0] - 6), background: look.background, opacity: 0.62 * opacity})} />
	) : null;

/** The keys. `pressed` maps a key id to how pressed it is (0..1): pressed keys turn orange. */
export const Keyboard: React.FC<{look: Look; pressed?: Record<string, number>}> = ({look, pressed = {}}) => (
	<>
		{KEYS.map((k) => {
			const p = pressed[k.id] ?? 0;
			return (
				<div
					key={k.id}
					style={abs(k.x, k.y, {
						width: k.w,
						height: k.h,
						borderRadius: 8,
						background: p > 0.5 ? look.orange : look.tile,
						boxShadow: '0 1px 2px rgba(60,72,100,.10)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontFamily: FONT,
						fontSize: k.fn ? (k.id === 'sym' ? 14 : 20) : 23,
						fontWeight: k.fn ? 400 : 300,
						color: p > 0.5 ? look.onOrange : look.ink,
						transform: `translateY(${p}px)`,
						paddingBottom: k.fn ? 0 : 4,
						boxSizing: 'border-box',
					})}
				>
					{k.label}
				</div>
			);
		})}
	</>
);

/** A text field with a blinking-free cursor. */
export const Field: React.FC<{look: Look; x: number; y: number; w: number; h: number; text: React.ReactNode; size?: number; cursor?: boolean}> = ({
	look,
	x,
	y,
	w,
	h,
	text,
	size = 15.5,
	cursor = true,
}) => (
	<div style={abs(x, y, {width: w, height: h, borderRadius: 14, background: look.panel, padding: '14px 16px', boxSizing: 'border-box'})}>
		<span style={{fontFamily: FONT, fontSize: size, fontWeight: 400, color: look.ink, lineHeight: 1.45}}>
			{text}
			{cursor ? <span style={{display: 'inline-block', width: 1.5, height: size * 1.15, background: look.ink, verticalAlign: 'text-bottom', marginLeft: 1}} /> : null}
		</span>
	</div>
);

/** The setup screen of the NTK app, before and after logging in. */
export const LoginScreen: React.FC<{look: Look; story: Story; loggedIn: number; buttonPressed: boolean}> = ({look, story, loggedIn, buttonPressed}) => (
	<>
		<StatusBar look={look} />
		<AppHeader look={look} page="settings" />
		<div style={abs(22, 236, {fontFamily: FONT, fontSize: 22, fontWeight: 200, color: look.ink})}>1. Keyboard</div>
		<div style={abs(22, 270, {fontFamily: FONT, fontSize: 13.5, color: look.ink})}>NTK is on and is your keyboard.</div>
		<div style={abs(22, 326, {fontFamily: FONT, fontSize: 22, fontWeight: 200, color: look.ink})}>2. NEAR account</div>
		<div style={{opacity: 1 - loggedIn}}>
			<div style={abs(22, 360, {fontFamily: FONT, fontSize: 13.5, color: look.ink})}>Not logged in.</div>
			<div
				style={abs(22, 392, {
					width: 340,
					height: 48,
					borderRadius: 12,
					background: buttonPressed ? '#E54E0E' : look.orange,
					color: look.onOrange,
					fontFamily: FONT,
					fontSize: 16,
					fontWeight: 500,
					display: 'flex',
					alignItems: 'center',
					paddingLeft: 22,
					boxSizing: 'border-box',
				})}
			>
				Log in with NEAR
			</div>
		</div>
		<div style={{opacity: loggedIn}}>
			<div style={abs(22, 360, {fontFamily: FONT, fontSize: 14.5, fontWeight: 500, color: look.ink})}>{story.account}</div>
		</div>
		<div style={abs(22, 478, {fontFamily: FONT, fontSize: 22, fontWeight: 200, color: look.ink})}>3. Typing fingerprint</div>
		<div style={abs(22, 512, {fontFamily: FONT, fontSize: 13.5, color: look.ink})}>Not enrolled yet.</div>
		<NavHandle />
	</>
);

/** The wallet's sheet over the app: approve one key. `y` slides it (0 shown, 1 hidden below). */
export const WalletSheet: React.FC<{look: Look; story: Story; hidden: number; approvePressed: boolean}> = ({look, story, hidden, approvePressed}) => {
	const h = 360;
	return (
		<>
			<div style={abs(0, 0, {width: SCREEN.w, height: SCREEN.h, background: 'rgba(29,32,38,0.28)', opacity: 1 - hidden})} />
			<div
				style={abs(0, SCREEN.h - h + hidden * (h + 30), {
					width: SCREEN.w,
					height: h,
					borderRadius: '24px 24px 0 0',
					background: look.panel,
					boxShadow: '0 -6px 24px rgba(60,72,100,.18)',
				})}
			>
				<div style={abs(24, 26, smallCaps(look.ink2, 11))}>Your NEAR wallet</div>
				<div style={abs(24, 52, {width: 330, fontFamily: FONT, fontSize: 21, fontWeight: 300, lineHeight: 1.25, color: look.ink})}>
					Add a key to {story.account}?
				</div>
				<div
					style={abs(24, 196, {
						width: 336,
						height: 48,
						borderRadius: 12,
						background: approvePressed ? '#E54E0E' : look.orange,
						color: look.onOrange,
						fontFamily: FONT,
						fontSize: 16,
						fontWeight: 500,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					})}
				>
					Approve
				</div>
				<div style={abs(24, 256, {width: 336, height: 44, borderRadius: 12, background: look.tile, fontFamily: FONT, fontSize: 15, color: look.ink, display: 'flex', alignItems: 'center', justifyContent: 'center'})}>
					Cancel
				</div>
			</div>
		</>
	);
};
/** Where the wallet's Approve button is, on the frame. */
export const approveCentre = (): [number, number] => [SCREEN.x + 24 + 168, SCREEN.y + SCREEN.h - 360 + 196 + 24];
export const loginButtonCentre = (): [number, number] => [SCREEN.x + 22 + 170, SCREEN.y + 392 + 24];
/** Where the account's key sits on the setup screen once logged in. */
export const loginKeyDock = (): [number, number] => [SCREEN.x + 340, SCREEN.y + 400];

/** The enrollment screen with the keyboard. */
export const EnrollScreen: React.FC<{look: Look; story: Story; text: string; pressed: Record<string, number>}> = ({look, story, text, pressed}) => (
	<>
		<StatusBar look={look} />
		<AppHeader look={look} page="enrollment" />
		<div style={abs(22, 118, {fontFamily: FONT, fontSize: 12.5, color: look.ink})}>Prompt 1 of 3</div>
		<div style={abs(22, 140, {width: 340, fontFamily: FONT, fontSize: 20, fontWeight: 200, lineHeight: 1.3, color: look.ink})}>{story.enrollPrompt}</div>
		<Field look={look} x={14} y={214} w={356} h={110} text={text} />
		<Strip look={look} status={story.account} keyLabel="enroll" />
		<Keyboard look={look} pressed={pressed} />
		<NavHandle />
	</>
);

/** A text conversation: the friend's message and your reply in the box above the keyboard. */
export const MessageScreen: React.FC<{
	look: Look;
	story: Story;
	reply: React.ReactNode;
	status: string;
	keyLabel: string;
	signPressed: boolean;
	pressed?: Record<string, number>;
	meter?: number | null;
	veil?: number;
}> = ({look, story, reply, status, keyLabel, signPressed, pressed, meter = null, veil = 0}) => (
	<>
		<StatusBar look={look} />
		<div style={abs(0, 38, {width: SCREEN.w, height: 62, background: look.panel})}>
			<div style={abs(20, 17, {fontFamily: FONT, fontSize: 22, fontWeight: 200, color: look.ink})}>‹</div>
			<div style={abs(46, 12, {width: 36, height: 36, borderRadius: 18, background: look.tile, fontFamily: FONT, fontSize: 15, fontWeight: 500, color: look.ink, display: 'flex', alignItems: 'center', justifyContent: 'center'})}>
				{story.friend.slice(0, 1)}
			</div>
			<div style={abs(94, 20, {fontFamily: FONT, fontSize: 17, fontWeight: 500, color: look.ink})}>{story.friend}</div>
		</div>
		<div
			style={abs(16, 124, {
				maxWidth: 300,
				padding: '12px 16px',
				borderRadius: '18px 18px 18px 6px',
				background: look.panel,
				fontFamily: FONT,
				fontSize: 15.5,
				lineHeight: 1.4,
				color: look.ink,
			})}
		>
			{story.friendMessage}
		</div>
		<Field look={look} x={14} y={318} w={356} h={122} text={reply} />
		<Strip look={look} status={status} keyLabel={keyLabel} keyPressed={signPressed} meter={meter} />
		<Keyboard look={look} pressed={pressed} />
		<KeyVeil look={look} opacity={veil} />
		<NavHandle />
	</>
);
