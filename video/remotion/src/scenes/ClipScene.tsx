// A scene built on a recorded phone clip: the clip on the phone's screen, the
// loupe magnifying the part that matters, the scene's label. The check scene
// adds a callout about the stamp button and, before its clip starts, a cycle
// through apps that each show the button.
import React from 'react';
import {CycleConfig, CycleScreen} from '../components/AppCycle';
import {ButtonCallout, CalloutConfig, cycleShift} from '../components/ButtonCallout';
import {Loupe, PreStart, ScreenClip, ClipConfig} from '../components/Clip';
import {SceneLabel} from '../components/Chrome';
import {PhoneLabel, Screen} from '../components/Phone';
import {Look, useSeconds} from '../theme';
import type {Timeline} from '../timeline';

export const ClipScene: React.FC<{
	look: Look;
	fwd: Timeline['fwd'];
	clip: ClipConfig;
	number: number;
	label: string;
	phoneLabel: string;
	callout?: CalloutConfig;
	cycle?: CycleConfig;
}> = ({look, fwd, clip, number, label, phoneLabel, callout, cycle}) => {
	const t = useSeconds();
	const pre: PreStart | undefined = cycle
		? {render: (w, h) => <CycleScreen look={look} clip={clip} cycle={cycle} t={t} w={w} h={h} />, shift: cycleShift(cycle, t)}
		: undefined;
	return (
		<>
			<Screen>
				<ScreenClip clip={clip} fwd={fwd} pre={pre} />
			</Screen>
			<PhoneLabel look={look} text={phoneLabel} />
			<Loupe clip={clip} look={look} fwd={fwd} t={t} pre={pre} />
			{callout && cycle ? <ButtonCallout look={look} clip={clip} callout={callout} cycle={cycle} t={t} /> : null}
			<SceneLabel look={look} number={number} text={label} />
		</>
	);
};
