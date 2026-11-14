// A scene built on a recorded phone clip: the clip on the phone's screen, the
// loupe magnifying the part that matters, the scene's label.
import React from 'react';
import {ButtonCallout, CalloutConfig} from '../components/ButtonCallout';
import {Loupe, ScreenClip, ClipConfig} from '../components/Clip';
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
}> = ({look, fwd, clip, number, label, phoneLabel, callout}) => {
	const t = useSeconds();
	return (
		<>
			<Screen>
				<ScreenClip clip={clip} fwd={fwd} />
			</Screen>
			<PhoneLabel look={look} text={phoneLabel} />
			<Loupe clip={clip} look={look} fwd={fwd} t={t} />
			{callout ? <ButtonCallout look={look} clip={clip} callout={callout} t={t} /> : null}
			<SceneLabel look={look} number={number} text={label} />
		</>
	);
};
