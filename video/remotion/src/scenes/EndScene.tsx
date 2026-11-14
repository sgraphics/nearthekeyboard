// The end card: the banner's name and the 3D keyboard, where to try it, and
// where it was built.
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {Mark} from '../components/Chrome';
import {EASE_OUT, FONT, Look, mix, ramp, smallCaps, Story, useSeconds} from '../theme';
import type {Timeline} from '../timeline';

type Beats = Timeline['scenes']['end']['beats'];

export const EndScene: React.FC<{look: Look; story: Story; b: Beats}> = ({look, story, b}) => {
	const t = useSeconds();
	const kb = ramp(t, b.keyboard, 1.0, EASE_OUT);
	const title = ramp(t, b.title, 0.8, EASE_OUT);
	const line = (i: number) => ramp(t, b.links + i * 0.35, 0.7, EASE_OUT);
	const rise = (p: number) => ({opacity: p, transform: `translateY(${mix(18, 0, p)}px)`});
	return (
		<AbsoluteFill style={{background: look.background}}>
			<Img
				src={staticFile('brand/ntk-keyboard-light-3x.png')}
				style={{position: 'absolute', left: 840, top: 214, width: 1040, height: (1040 * 512) / 856, ...rise(kb)}}
			/>
			<div style={{position: 'absolute', left: 130, top: 250, ...rise(title)}}>
				<Mark height={40} />
				<div style={{marginTop: 44, fontFamily: FONT, fontSize: 104, fontWeight: 700, lineHeight: 1.0, letterSpacing: '-0.01em', color: look.ink}}>
					NEAR THE
					<br />
					KEYBOARD
				</div>
			</div>
			<div style={{position: 'absolute', left: 130, top: 654, ...rise(line(0))}}>
				<span
					style={{
						fontFamily: FONT,
						fontSize: 52,
						fontWeight: 400,
						color: look.ink,
						textDecoration: 'underline',
						textDecorationColor: look.orange,
						textDecorationThickness: 3,
						textUnderlineOffset: 12,
					}}
				>
					{story.site}
				</span>
			</div>
			<div style={{position: 'absolute', left: 130, top: 754, ...smallCaps(look.ink, 18), ...rise(line(1))}}>{story.builtAt}</div>
		</AbsoluteFill>
	);
};
