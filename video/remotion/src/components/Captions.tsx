// Burned-in captions at the bottom right, from the same cues that
// scripts/srt.mjs writes to the .srt file.
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Cue} from '../schedule';
import {CAPTION, FONT, Look} from '../theme';

const FADE = 5;

export const Captions: React.FC<{cues: Cue[]; look: Look}> = ({cues, look}) => {
	const frame = useCurrentFrame();
	const i = cues.findIndex((c) => frame >= c.from && frame < c.to);
	if (i < 0) return null;
	const c = cues[i];
	// Fade only at the edges of a run of captions; one caption replacing another switches at once.
	const joinedBefore = i > 0 && cues[i - 1].to >= c.from - 1;
	const joinedAfter = i + 1 < cues.length && cues[i + 1].from <= c.to + 1;
	const fadeIn = joinedBefore || c.from === 0 ? 1 : Math.min(1, (frame - c.from + 1) / FADE);
	const fadeOut = joinedAfter ? 1 : Math.min(1, (c.to - frame) / FADE);
	return (
		<div
			style={{
				position: 'absolute',
				left: CAPTION.x,
				width: CAPTION.w,
				bottom: 1080 - CAPTION.bottom,
				display: 'flex',
				alignItems: 'flex-start',
				gap: 22,
				opacity: Math.min(fadeIn, fadeOut),
			}}
		>
			<div style={{flex: 'none', width: 10, height: 10, borderRadius: 2, marginTop: look.captionSize * 0.63 - 5, background: look.orange}} />
			<div
				style={{
					fontFamily: FONT,
					fontSize: look.captionSize,
					fontWeight: look.captionWeight,
					lineHeight: 1.26,
					letterSpacing: '-0.01em',
					color: look.ink,
					whiteSpace: 'pre-line',
					textWrap: 'balance',
				}}
			>
				{c.text}
			</div>
		</div>
	);
};
