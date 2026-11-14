// The opening: the keyboard alone, under the name. Keys light up one after
// another as they are tapped, then Sign: the meter runs while the keys rest
// under a veil, and the strip says MATCH. A few words under the keyboard name
// each beat. No phone, no captions: the layout with the phone comes after.
import React from 'react';
import {Mark} from '../components/Chrome';
import {KB, KeyVeil, Keyboard, Strip} from '../components/Screens';
import {EASE_OUT, FONT, Look, mix, ramp, SCREEN, SHADOW_LIFT, Story, useSeconds} from '../theme';
import type {Timeline} from '../timeline';

type Hero = Timeline['scenes']['hero'];

/** The keyboard's part of the drawn screen (screen units): from the strip to below the last row. */
const TOP = KB.stripY;
const H = KB.rowY[3] + KB.keyH + 10 - TOP;
const SCALE = 2;
const CARD = {w: SCREEN.w * SCALE, h: H * SCALE, y: 268};
const CARD_X = (1920 - CARD.w) / 2;

export const HeroScene: React.FC<{look: Look; story: Story; s: Hero}> = ({look, story, s}) => {
	const t = useSeconds();
	const b = s.beats;
	const rise = (p: number, by = 22) => ({opacity: p, transform: `translateY(${mix(by, 0, p)}px)`});

	// typing: each letter's key is pressed for a moment
	const letters = [...s.letters];
	const pressed: Record<string, number> = {};
	letters.forEach((l, i) => {
		const at = b.taps + i * b.tapEvery;
		const id = l === ' ' ? ' ' : l.toLowerCase();
		if (t >= at && t < at + Math.min(0.14, b.tapEvery * 0.95)) pressed[id] = 1;
	});

	// Sign: the key goes down, the meter runs while the keys rest, then MATCH
	const waiting = t >= b.sign && t < b.match;
	const matched = t >= b.match;
	const waited = Math.max(0, t - b.sign);
	const meter = waiting ? mix(0.04, 0.92, 1 - Math.exp(-waited / Math.max(0.3, (b.match - b.sign) / 2.2))) : null;
	const veil = waiting ? Math.min(1, waited / 0.25) : 0;
	const keyLabel = waiting ? `0:${String(Math.floor(waited)).padStart(2, '0')}` : 'sign';
	const status: React.ReactNode = matched ? (
		<span style={{opacity: ramp(t, b.match, 0.25)}}>
			<span style={{color: look.green, fontWeight: 600}}>MATCH</span> [NTK {story.stampId}]
		</span>
	) : (
		''
	);

	// the few words under the keyboard: one beat at a time, crossfading
	const word = (w: Hero['words'][number]) => Math.min(ramp(t, w.from, 0.35), w.to >= s.seconds ? 1 : 1 - ramp(t, w.to - 0.3, 0.3));

	return (
		<>
			<div style={{position: 'absolute', left: 0, width: 1920, top: 74, display: 'flex', flexDirection: 'column', alignItems: 'center', ...rise(ramp(t, b.title, 0.8, EASE_OUT))}}>
				<Mark height={40} />
				<div style={{marginTop: 26, fontFamily: FONT, fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em', color: look.ink, whiteSpace: 'nowrap'}}>
					NEAR THE KEYBOARD
				</div>
			</div>
			<div
				style={{
					position: 'absolute',
					left: CARD_X,
					top: CARD.y,
					width: CARD.w,
					height: CARD.h,
					borderRadius: 28,
					overflow: 'hidden',
					background: look.background,
					boxShadow: SHADOW_LIFT,
					...rise(ramp(t, b.keyboard, 0.9, EASE_OUT), 30),
				}}
			>
				<div style={{position: 'absolute', left: 0, top: 0, width: SCREEN.w, height: H, transform: `scale(${SCALE})`, transformOrigin: 'top left'}}>
					<div style={{position: 'absolute', left: 0, top: -TOP, width: SCREEN.w, height: SCREEN.h}}>
						<Strip
							look={look}
							status={status}
							statusDot={matched ? look.green : undefined}
							keyLabel={keyLabel}
							keyPressed={Math.abs(t - b.sign - 0.1) < 0.18}
							meter={meter}
						/>
						<Keyboard look={look} pressed={pressed} />
						<KeyVeil look={look} opacity={veil} />
					</div>
				</div>
			</div>
			{s.words.map((w) => (
				<div
					key={w.text}
					style={{
						position: 'absolute',
						left: 0,
						width: 1920,
						top: CARD.y + CARD.h + 40,
						textAlign: 'center',
						fontFamily: FONT,
						fontSize: 50,
						fontWeight: look.titleWeight,
						color: look.ink,
						whiteSpace: 'nowrap',
						opacity: word(w),
					}}
				>
					{w.text}
				</div>
			))}
		</>
	);
};
