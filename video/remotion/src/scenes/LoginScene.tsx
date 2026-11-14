// Set up, part 1: log in with NEAR. The app asks the wallet; the wallet adds
// a function-call key to the account that can only talk to NTK; that key is
// the one on the phone.
import React from 'react';
import {SceneLabel} from '../components/Chrome';
import {Finger, fingerPath, TapRing} from '../components/Finger';
import {Key} from '../components/Icons';
import {PhoneLabel, Screen} from '../components/Phone';
import {approveCentre, LoginScreen, loginButtonCentre, loginKeyDock, WalletSheet} from '../components/Screens';
import {KeyCard, keyCardBadge, NearPanel, nearKeyIcon, KEY_CARD} from '../components/Stage';
import {curve, EASE, Look, mix, ramp, Story, useSeconds} from '../theme';
import type {Timeline} from '../timeline';

type Beats = Timeline['scenes']['login']['beats'];

export const LoginScene: React.FC<{look: Look; story: Story; b: Beats; label: string; phoneLabel: string}> = ({look, story, b, label, phoneLabel}) => {
	const t = useSeconds();
	const taps = [
		{at: b.tapLogin, pt: loginButtonCentre()},
		{at: b.approve, pt: approveCentre()},
	];
	// one finger per tap: it leaves the screen while the wallet's sheet comes up, then returns
	const fingers = taps.map((k) => fingerPath(t, [k], [560, 1180]));
	const sheetIn = ramp(t, b.wallet, 0.55);
	const sheetOut = ramp(t, b.approve + 0.35, 0.5);
	const keyRow = ramp(t, b.keyAdded, 0.6);
	const travel = ramp(t, b.keyTravel, b.keyDocked - b.keyTravel, EASE);
	const from = keyCardBadge();
	const to = loginKeyDock();
	const keyPt = curve(from, [mix(from[0], to[0], 0.5), Math.max(from[1], to[1]) + 90], to, travel);
	const card = ramp(t, b.keyAdded + 0.2, 0.6);
	const link = ramp(t, b.keyAdded + 0.3, 0.6) * (1 - ramp(t, b.keyDocked + 0.8, 0.6));
	const row = nearKeyIcon();
	const loggedIn = ramp(t, b.keyDocked - 0.2, 0.5);
	const keyVisible = t >= b.keyTravel;
	return (
		<>
			<Screen>
				<LoginScreen look={look} story={story} loggedIn={loggedIn} buttonPressed={Math.abs(t - b.tapLogin - 0.1) < 0.18} />
				{sheetIn > 0 && sheetOut < 1 ? (
					<WalletSheet look={look} story={story} hidden={1 - sheetIn + sheetOut} approvePressed={Math.abs(t - b.approve - 0.1) < 0.18} />
				) : null}
			</Screen>
			<PhoneLabel look={look} text={phoneLabel} />
			<NearPanel look={look} story={story} opacity={ramp(t, b.near, 0.6)} keyRow={keyRow} keyHi={keyRow * (1 - ramp(t, b.keyDocked + 0.6, 0.6))} />
			{/* the key the wallet added, joined to its row in the account */}
			<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, opacity: link}}>
				<path d={`M${row[0]} ${row[1] + 16} V${KEY_CARD.y + 58} H${KEY_CARD.x}`} fill="none" stroke={look.orange} strokeWidth={2.5} strokeDasharray="6 6" />
			</svg>
			<KeyCard look={look} opacity={card} badge={!keyVisible} />
			{/* the key: from the card to the phone */}
			{keyVisible ? (
				<div
					style={{
						position: 'absolute',
						left: keyPt[0] - 24,
						top: keyPt[1] - 24,
						width: 48,
						height: 48,
						borderRadius: 24,
						background: look.orange,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						boxShadow: '0 6px 16px rgba(253,91,21,0.35)',
					}}
				>
					<Key size={32} color={look.onOrange} stroke={2} />
				</div>
			) : null}
			{taps.map((k) => (
				<TapRing key={k.at} look={look} pt={k.pt} t={t} at={k.at} />
			))}
			{fingers.map((f, i) => (
				<Finger key={i} look={look} {...f} />
			))}
			<SceneLabel look={look} number={2} text={label} />
		</>
	);
};
