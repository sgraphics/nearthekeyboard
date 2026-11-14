// Animation B, the stamp: Sign sends the new typing sealed to the enclave;
// NEAR confirms the signing key is the account's; the enclave compares the
// typing with the fingerprint (the dial); only the enclave's key signs the
// stamp; the tag goes back into the text and the stamp is published; anyone
// looks it up by its id and gets MATCH.
import React from 'react';
import {SceneLabel} from '../components/Chrome';
import {Finger, fingerPath, TapRing} from '../components/Finger';
import {Check, Key} from '../components/Icons';
import {PhoneLabel, Screen} from '../components/Phone';
import {MessageScreen, stripKeyCentre} from '../components/Screens';
import {
	Dial,
	Enclave,
	ENCLAVE_IN,
	FingerprintMap,
	NearPanel,
	nearKeyIcon,
	ReaderPanel,
	readerEdge,
	StampCard,
	StampKey,
	StoragePanel,
	storageSlot,
} from '../components/Stage';
import {curve, EASE, EASE_OUT, FONT, Look, mix, ramp, SCREEN, smallCaps, STAGE, Story, useSeconds} from '../theme';
import type {Timeline} from '../timeline';
import {Capsule} from './SealScene';

type Beats = Timeline['scenes']['stamp']['beats'];

export const StampScene: React.FC<{look: Look; story: Story; b: Beats; label: string; phoneLabel: string}> = ({look, story, b, label, phoneLabel}) => {
	const t = useSeconds();
	const signPt = stripKeyCentre();
	const finger = fingerPath(t, [{at: b.sign, pt: signPt}], [620, 1180]);
	const players = ramp(t, b.players, 0.7);

	// the capsule: made on the phone, carried in, opened
	const trayC: [number, number] = [STAGE.tray.x + STAGE.tray.w / 2, STAGE.tray.y + STAGE.tray.h / 2];
	const made = ramp(t, b.sign + 0.15, 0.5);
	const go = ramp(t, b.travel, b.arrive - b.travel, EASE);
	const dock = ENCLAVE_IN.dock;
	const capsulePt = curve(trayC, [mix(trayC[0], dock[0], 0.5), trayC[1] + 120], dock, go);
	const open = ramp(t, b.open, 0.8);

	// NEAR: is this key the account's?
	const ask = ramp(t, b.nearAsk, 1.0, EASE);
	const back = ramp(t, b.nearOk + 0.5, 1.0, EASE);
	const askFrom: [number, number] = [STAGE.enclave.x + STAGE.enclave.w / 2 - 120, STAGE.enclave.y + 40];
	const askTo: [number, number] = [nearKeyIcon()[0] + 4, STAGE.near.y + STAGE.near.h + 26];
	const askPt = back > 0 ? curve(askTo, [mix(askTo[0], askFrom[0], 0.5), askTo[1] + 6], askFrom, back) : curve(askFrom, [mix(askTo[0], askFrom[0], 0.5), askTo[1] + 6], askTo, ask);
	const keyHi = ramp(t, b.nearAsk + 0.9, 0.3) * (1 - ramp(t, b.open, 0.6));
	const keyOk = ramp(t, b.nearOk, 0.5);

	// compare: the new marks over the fingerprint, then the dial
	const overlay = ramp(t, b.open + 0.3, 1.6, (x) => x);
	const dialIn = ramp(t, b.score, 0.5);
	const needle = mix(0, story.scorePct, ramp(t, b.score + 0.5, 2.6, EASE_OUT));

	// sign: the card, the stamp key pressing on it
	const cardIn = ramp(t, b.press, 0.5);
	const keyIn = ramp(t, b.press + 0.5, 0.4);
	const keyMove = ramp(t, b.press + 1.1, 0.9, EASE);
	const signed = ramp(t, b.press + 2.0, 1.0);
	const keyOut = ramp(t, b.press + 3.2, 0.4);
	const cardX = ENCLAVE_IN.map.x;
	const cardY = ENCLAVE_IN.cardY;
	const keyRest: [number, number] = [STAGE.enclave.x + STAGE.enclave.w - 90, STAGE.enclave.y + 40 + 22];
	const keyOn: [number, number] = [cardX + 430, cardY + 60];
	const keyPt = curve(keyRest, [keyRest[0] + 30, mix(keyRest[1], keyOn[1], 0.6)], keyOn, keyMove);

	// the tag back into the text; the stamp out to storage
	const tagGo = ramp(t, b.tagBack, 1.3, EASE);
	const tagFrom: [number, number] = [cardX + 150, cardY + 30];
	const tagTo: [number, number] = [SCREEN.x + 200, SCREEN.y + 318 + 92];
	const tagPt = curve(tagFrom, [mix(tagFrom[0], tagTo[0], 0.5), tagTo[1] + 140], tagTo, tagGo);
	const tagInText = t >= b.tagBack + 1.3;
	const pubGo = ramp(t, b.publish, 1.3, EASE);
	const slot = storageSlot();
	const pubFrom: [number, number] = [cardX + 247, cardY + 46];
	const pubPt = curve(pubFrom, [mix(pubFrom[0], slot[0], 0.6), pubFrom[1] - 60], slot, pubGo);
	const stored = ramp(t, b.publish + 1.2, 0.4);
	const looking = ramp(t, b.lookup, 0.5);
	const lookLine = ramp(t, b.lookup + 0.3, 0.7, EASE);
	const match = ramp(t, b.match, 0.5);

	const waiting = t >= b.sign && !tagInText;
	const status = tagInText ? `MATCH: [NTK ${story.stampId}] inserted` : waiting ? 'Checking with the enclave…' : story.account;
	// The animation stretches the wait to explain it; the key counts the call's real seconds (story.waitSeconds).
	const waited = Math.max(0, ((t - b.sign) / Math.max(0.1, b.tagBack + 1.3 - b.sign)) * story.waitSeconds);
	const keyLabel = waiting ? `0:${String(Math.floor(waited)).padStart(2, '0')}` : 'sign';
	// the app's meter while it waits: the needle eases toward about 90 %, then 100 % on the match
	const meter = waiting ? mix(0, 0.9, 1 - Math.exp(-(t - b.sign) / 5)) : null;
	const veil = waiting ? Math.min(1, (t - b.sign) / 0.3) : 0;
	const reply = (
		<>
			{story.reply}
			{tagInText ? <span> [NTK {story.stampId}]</span> : null}
		</>
	);

	return (
		<>
			<Screen>
				<MessageScreen look={look} story={story} reply={reply} status={status} keyLabel={keyLabel} signPressed={Math.abs(t - b.sign - 0.1) < 0.18} meter={meter} veil={veil} />
			</Screen>
			<PhoneLabel look={look} text={phoneLabel} />
			<NearPanel look={look} story={story} opacity={1} keyRow={1} keyHi={keyHi} keyOk={keyOk * (1 - ramp(t, b.publish, 0.6))} codeRow={1} />
			<Enclave look={look} story={story} opacity={1} codeOk={1}>
				<div style={{position: 'absolute', left: ENCLAVE_IN.map.x - STAGE.enclave.x, top: ENCLAVE_IN.map.y - STAGE.enclave.y + 3 * 50 + 6, ...smallCaps(look.ink2, 12)}}>
					Your typing fingerprint{overlay > 0 ? ' · and the new typing' : ''}
				</div>
			</Enclave>
			<FingerprintMap look={look} fill={1} overlay={overlay} overlayKeys={story.reply.toLowerCase().replace(/[^a-z]/g, '').slice(0, 24)} />
			<Dial
				look={look}
				x={ENCLAVE_IN.map.x}
				y={ENCLAVE_IN.dialY}
				w={494}
				value={needle}
				needs={story.thresholdPct}
				opacity={dialIn * (1 - ramp(t, b.press - 0.3, 0.3) * 0)}
				readout={`${Math.round(needle)} %  ·  needs ${story.thresholdPct} %`}
			/>
			<StampCard look={look} story={story} x={cardX} y={cardY} opacity={cardIn} signed={signed} />
			<StampKey look={look} x={keyPt[0]} y={keyPt[1]} opacity={keyIn * (1 - keyOut)} label={keyMove < 0.05} />
			<StoragePanel look={look} story={story} opacity={players} stored={stored} hi={ramp(t, b.lookup + 0.9, 0.3)} />
			<ReaderPanel look={look} story={story} opacity={players} looking={looking} match={match} />
			{/* looking the stamp up by its id */}
			<svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none', opacity: looking}}>
				<line
					x1={readerEdge()[0]}
					y1={readerEdge()[1]}
					x2={readerEdge()[0]}
					y2={mix(readerEdge()[1], slot[1] + 20, lookLine)}
					stroke={look.orange}
					strokeWidth={2.5}
					strokeDasharray="6 6"
				/>
			</svg>
			{/* the capsule */}
			{made > 0 && open < 1 ? <Capsule look={look} cx={capsulePt[0]} cy={capsulePt[1]} p={1} open={open} opacity={made * (1 - ramp(t, b.open + 0.6, 0.4))} /> : null}
			{/* the key question to NEAR, and the answer */}
			{t >= b.nearAsk && t < b.nearOk + 1.6 ? (
				<div
					style={{
						position: 'absolute',
						left: askPt[0] - 22,
						top: askPt[1] - 22,
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						opacity: ramp(t, b.nearAsk, 0.3) * (1 - ramp(t, b.nearOk + 1.3, 0.3)),
					}}
				>
					<div style={{width: 44, height: 44, borderRadius: 22, background: look.ink, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
						<Key size={28} color="#FFFFFF" stroke={2} />
					</div>
					{back > 0 ? <Check size={30} color={look.green} stroke={2.6} /> : <span style={{fontFamily: FONT, fontSize: 22, color: look.ink}}>?</span>}
				</div>
			) : null}
			{/* the tag, out to the phone */}
			{tagGo > 0 && !tagInText ? (
				<div
					style={{
						position: 'absolute',
						left: tagPt[0],
						top: tagPt[1],
						transform: 'translate(-50%, -50%)',
						padding: '8px 14px',
						borderRadius: 10,
						background: look.orange,
						color: look.onOrange,
						fontFamily: FONT,
						fontSize: 20,
						fontWeight: 500,
						whiteSpace: 'nowrap',
						boxShadow: '0 6px 16px rgba(253,91,21,0.35)',
					}}
				>
					[NTK {story.stampId}]
				</div>
			) : null}
			{/* the stamp, out to public storage */}
			{pubGo > 0 && pubGo < 1 ? (
				<div
					style={{
						position: 'absolute',
						left: pubPt[0],
						top: pubPt[1],
						transform: `translate(-50%, -50%) scale(${mix(1, 0.55, pubGo)})`,
						padding: '10px 16px',
						borderRadius: 12,
						background: look.background,
						border: `2px solid ${look.orange}`,
						fontFamily: FONT,
						fontSize: 18,
						color: look.ink,
						whiteSpace: 'nowrap',
					}}
				>
					stamp:{story.stampId} · signed
				</div>
			) : null}
			<TapRing look={look} pt={signPt} t={t} at={b.sign} />
			<Finger look={look} {...finger} />
			<SceneLabel look={look} number={5} text={label} />
		</>
	);
};
