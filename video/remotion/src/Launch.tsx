// The whole video. Layers, bottom to top: the background; the phone's body;
// the scenes (each fades in over the one before); the mark and "testnet";
// the captions.
import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Captions} from './components/Captions';
import {TopRight} from './components/Chrome';
import {PhoneBody, PhoneCamera} from './components/Phone';
import {captionTrack, plan, SceneId} from './schedule';
import {ClipScene} from './scenes/ClipScene';
import {EndScene} from './scenes/EndScene';
import {LoginScene} from './scenes/LoginScene';
import {SealScene} from './scenes/SealScene';
import {StampScene} from './scenes/StampScene';
import type {Timeline} from './timeline';

/** The storyboard's numbers, shown in each scene's label. */
const NUMBER: Record<SceneId, number> = {problem: 1, login: 2, enroll: 2, seal: 3, moment: 4, stamp: 5, verify: 6, end: 7};

const SceneView: React.FC<{id: SceneId; t: Timeline}> = ({id, t}) => {
	const {look, story, fwd, scenes} = t;
	switch (id) {
		case 'problem':
		case 'enroll':
		case 'moment':
		case 'verify': {
			const s = scenes[id];
			return <ClipScene look={look} fwd={fwd} clip={s.clip} number={NUMBER[id]} label={s.label} phoneLabel={s.phone} />;
		}
		case 'login':
			return <LoginScene look={look} story={story} b={scenes.login.beats} label={scenes.login.label} phoneLabel={scenes.login.phone} />;
		case 'seal':
			return <SealScene look={look} story={story} b={scenes.seal.beats} label={scenes.seal.label} phoneLabel={scenes.seal.phone} />;
		case 'stamp':
			return <StampScene look={look} story={story} b={scenes.stamp.beats} label={scenes.stamp.label} phoneLabel={scenes.stamp.phone} />;
		case 'end':
			return <EndScene look={look} story={story} b={scenes.end.beats} />;
	}
};

/**
 * Scenes change by a short dip: in the overlap of two scenes, the old one fades out in the
 * first half and the new one fades in in the second half, so their texts never cross.
 * The phone's body is a layer below the scenes and stays.
 */
const SceneFade: React.FC<{frames: number; overlap: number; first: boolean; last: boolean; children: React.ReactNode}> = ({
	frames,
	overlap,
	first,
	last,
	children,
}) => {
	const frame = useCurrentFrame();
	const half = Math.max(1, overlap / 2);
	const fadeIn = first || overlap === 0 ? 1 : Math.max(0, Math.min(1, (frame + 1 - half) / half));
	const fadeOut = last || overlap === 0 ? 1 : Math.max(0, Math.min(1, (frames - half - frame) / half));
	return <AbsoluteFill style={{opacity: Math.min(fadeIn, fadeOut)}}>{children}</AbsoluteFill>;
};

export const Launch: React.FC<Timeline> = (t) => {
	const frame = useCurrentFrame();
	const {scenes, overlap} = plan(t);
	const cues = captionTrack(t);
	const end = scenes[scenes.length - 1];
	const chrome = 1 - Math.max(0, Math.min(1, (frame - end.from) / Math.max(1, overlap)));
	return (
		<AbsoluteFill style={{background: t.look.background}}>
			<PhoneBody look={t.look} opacity={chrome} />
			{scenes.map((s) => (
				<Sequence key={s.id} from={s.from} durationInFrames={s.frames} name={`${NUMBER[s.id]} ${s.id}`}>
					<SceneFade frames={s.frames} overlap={overlap} first={s.index === 0} last={s.index === scenes.length - 1}>
						<SceneView id={s.id} t={t} />
					</SceneFade>
				</Sequence>
			))}
			<PhoneCamera look={t.look} opacity={chrome} />
			<TopRight look={t.look} opacity={chrome} />
			<Captions cues={cues} look={t.look} />
		</AbsoluteFill>
	);
};
