// THE config of the launch video: every timing, caption, clip cut and story
// value is here, and nowhere else. Edit it in Remotion Studio's sidebar
// (npm run studio, then the "Props" panel; "Save" writes the change back into
// this file) or by hand.
//
// Times are seconds. A scene's captions, beats and loupe keyframes count from
// the start of that scene. Scenes play in a fixed order (src/schedule.ts) and
// overlap by `transition` seconds, where the next one fades in.
//
// Clip parts are seconds in the clip file (public/clips/), each with a speed:
// a part faster than 1 shows the "FWD ▶▶" marker (and VHS lines if fwd.vhs is on). A jump
// between parts is a hard cut. The loupe is the large panel that magnifies a
// region of the phone screen: x and y are the region's centre as fractions of
// the screen (0..1), w its width as a fraction of the screen width (1 = all of
// it; 0.5 = twice as close).
//
// The defaultProps below must stay a plain literal (no variables, no
// functions), or Studio cannot save into it. scripts/srt.mjs reads it too.
import React from 'react';
import {Composition} from 'remotion';
import {zColor, zTextarea} from '@remotion/zod-types';
import {z} from 'zod';
import {Launch} from './Launch';
import {FPS, HEIGHT, WIDTH, totalFrames} from './schedule';

const caption = z.object({from: z.number(), to: z.number(), text: zTextarea()});
const part = z.object({from: z.number(), to: z.number(), speed: z.number().min(0.25).max(400)});
const focus = z.object({at: z.number(), x: z.number(), y: z.number(), w: z.number().min(0.2).max(2)});
const clip = z.object({
	src: z.string(),
	placeholder: z.boolean(),
	start: z.number(),
	parts: z.array(part),
	loupe: z.array(focus),
	note: z.string(),
});
const clipScene = z.object({seconds: z.number().min(1), label: z.string(), phone: z.string(), captions: z.array(caption), clip});
// The check scene: a layer over the loupe that points at the stamp button and explains it ("{app}" in a
// line becomes the name of the app shown), and, before its clip starts, a cycle through apps that each
// show the button. An app is the clip's own first frame ("clip"), a frame of another recording ("video",
// src and frame in seconds), or a drawn screen ("forum", "email": lines, the last one ends at the tag),
// with where its button is on the screen (target: centre x, y and size w, h as fractions).
const callout = z.object({at: z.number(), until: z.number(), title: z.string(), lines: z.array(zTextarea())});
const cycleApp = z.object({
	kind: z.enum(['clip', 'video', 'forum', 'email']),
	label: z.string(),
	src: z.string(),
	frame: z.number(),
	lines: z.array(z.string()),
	target: z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()}),
});
const cycle = z.object({at: z.number(), every: z.number().min(0.5), slide: z.number().min(0.05), apps: z.array(cycleApp).min(1)});
const animScene = <T extends z.ZodRawShape>(beats: T) =>
	z.object({seconds: z.number().min(1), label: z.string(), phone: z.string(), captions: z.array(caption), beats: z.object(beats)});
const n = z.number();
// The opening: the keyboard alone under the name; keys light up as they are tapped, then Sign, the meter,
// MATCH. `letters` are the keys tapped, in order (a space is the space bar); `words` are the few words
// under the keyboard, with their times (seconds in the scene).
const heroScene = animScene({title: n, keyboard: n, taps: n, tapEvery: n, sign: n, match: n}).extend({
	letters: z.string(),
	words: z.array(caption),
});

export const timelineSchema = z.object({
	transition: z.number().min(0).max(2),
	look: z.object({
		background: zColor(),
		panel: zColor(),
		tile: zColor(),
		tileDown: zColor(),
		ink: zColor(),
		ink2: zColor(),
		minor: zColor(),
		line: zColor(),
		orange: zColor(),
		onOrange: zColor(),
		green: zColor(),
		phoneBody: zColor(),
		captionSize: z.number().min(20).max(90),
		captionWeight: z.number().min(100).max(900),
		titleWeight: z.number().min(100).max(900),
	}),
	story: z.object({
		account: z.string(),
		friend: z.string(),
		friendMessage: zTextarea(),
		reply: zTextarea(),
		stampId: z.string(),
		scorePct: z.number().min(0).max(100),
		thresholdPct: z.number().min(0).max(100),
		waitSeconds: z.number().min(0),
		enrollPrompt: zTextarea(),
		enrollText: zTextarea(),
		tapLetters: z.string(),
		codeVersion: z.string(),
		tagline: z.string(),
		site: z.string(),
		repo: z.string(),
		builtAt: z.string(),
	}),
	fwd: z.object({
		label: z.string(),
		showSpeed: z.boolean(),
		vhs: z.boolean(),
		lines: z.number().min(0).max(1),
		grain: z.number().min(0).max(1),
	}),
	scenes: z.object({
		hero: heroScene,
		problem: clipScene,
		login: animScene({near: n, tapLogin: n, wallet: n, approve: n, keyAdded: n, keyTravel: n, keyDocked: n}),
		enroll: clipScene,
		seal: animScene({enclave: n, taps: n, tapEvery: n, pack: n, travel: n, arrive: n, code: n, open: n, settle: n, fill: n, sealed: n}),
		moment: clipScene,
		stamp: animScene({
			players: n, sign: n, travel: n, arrive: n, nearAsk: n, nearOk: n, open: n, score: n, press: n, tagBack: n, publish: n, lookup: n, match: n,
		}),
		verify: clipScene.extend({callout, cycle}),
		end: animScene({keyboard: n, title: n, links: n}),
	}),
});

export type Timeline = z.infer<typeof timelineSchema>;

export const LaunchComposition: React.FC = () => (
	<Composition
		id="Launch"
		component={Launch}
		schema={timelineSchema}
		fps={FPS}
		width={WIDTH}
		height={HEIGHT}
		durationInFrames={FPS * 120}
		calculateMetadata={({props}) => ({durationInFrames: totalFrames(props)})}
		defaultProps={{
			transition: 0.5,
			look: {
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
			},
			story: {
				account: 'ntkr-039f5371.ntkw-1e2ec567.testnet',
				friend: 'Maya',
				friendMessage: 'But be honest. Did you write that yourself, or was it ChatGPT?',
				reply: 'Every word of it was mine, typed on this phone by me.',
				stampId: '14feb978ef',
				scorePct: 94,
				thresholdPct: 80,
				waitSeconds: 4,
				enrollPrompt: 'Type what you ate yesterday and how you liked it.',
				enrollText: 'Yesterday I had lentil soup',
				tapLetters: 'soup',
				codeVersion: '6fd05f44',
				tagline: 'Prove you typed it by hand.',
				site: 'ntk.tools',
				repo: 'github.com/sgraphics/nearthekeyboard',
				builtAt: 'Built at NEAR HACKATHON',
			},
			fwd: {
				label: 'FWD',
				showSpeed: true,
				vhs: false,
				lines: 0.5,
				grain: 0.35,
			},
			scenes: {
				hero: {
					seconds: 8.5,
					label: '',
					phone: '',
					captions: [],
					beats: {title: 0, keyboard: 0.35, taps: 1.5, tapEvery: 0.13, sign: 4.6, match: 6.4},
					letters: 'every word was mine',
					words: [
						{from: 1.0, to: 4.3, text: 'Type your message'},
						{from: 4.3, to: 8.5, text: 'Prove you typed it'},
					],
				},
				problem: {
					seconds: 7.5,
					label: '',
					phone: '',
					captions: [
						{from: 0, to: 3.7, text: 'Anyone can paste AI text and call it their own.'},
						{from: 3.7, to: 7.5, text: 'Near The Keyboard lets you prove you typed it.'},
					],
					clip: {
						src: 'clips/problem.mp4',
						placeholder: false,
						start: 0,
						parts: [{from: 1.3, to: 10.8, speed: 1}],
						loupe: [
							{at: 0, x: 0.5, y: 0.37, w: 1},
							{at: 2.8, x: 0.5, y: 0.37, w: 1},
							{at: 3.9, x: 0.5, y: 0.52, w: 1},
						],
						note: '',
					},
				},
				login: {
					seconds: 8.5,
					label: '',
					phone: '',
					captions: [
						{from: 0.3, to: 4.4, text: 'Log in with your NEAR account.'},
						{from: 4.4, to: 8.5, text: 'Your wallet adds a key that can only talk to NTK.'},
					],
					beats: {near: 0, tapLogin: 1.2, wallet: 1.7, approve: 3.4, keyAdded: 4.0, keyTravel: 5.0, keyDocked: 6.8},
				},
				enroll: {
					seconds: 11,
					label: '',
					phone: '',
					captions: [
						{from: 0.2, to: 8.1, text: 'Then type three short texts, so NTK learns how you type.'},
						{from: 8.1, to: 11, text: 'Fingerprint created, sealed in the enclave.'},
					],
					clip: {
						src: 'clips/enroll.mp4',
						placeholder: false,
						start: 0,
						parts: [
							{from: 4.7, to: 6.1, speed: 1},
							{from: 6.1, to: 39.4, speed: 12},
							{from: 39.4, to: 41.4, speed: 1},
							{from: 41.4, to: 358.9, speed: 160},
							{from: 358.9, to: 363.3, speed: 1},
						],
						loupe: [
							{at: 0, x: 0.5, y: 0.27, w: 1},
							{at: 4.2, x: 0.5, y: 0.27, w: 1},
							{at: 4.9, x: 0.5, y: 0.6, w: 1},
							{at: 7.9, x: 0.5, y: 0.6, w: 1},
							{at: 8.5, x: 0.5, y: 0.27, w: 1},
						],
						note: 'Typed by our test robot',
					},
				},
				seal: {
					seconds: 23,
					label: '',
					phone: '',
					captions: [
						{from: 0.3, to: 6.6, text: 'NTK measures each tap: the hold, the move to the next key, where your finger lands.'},
						{from: 6.6, to: 11.2, text: 'The measurements are sealed on the phone. Only the enclave can open them.'},
						{from: 11.2, to: 15.4, text: 'It runs on OutLayer, in Intel TDX. NEAR records which code may use its keys.'},
						{from: 15.4, to: 19.4, text: 'Inside, they become your typing fingerprint.'},
						{from: 19.4, to: 23, text: 'Nobody can read it: not us, not OutLayer, not you.'},
					],
					beats: {enclave: 0, taps: 1.0, tapEvery: 1.25, pack: 6.6, travel: 8.8, arrive: 11.0, code: 11.4, open: 14.2, settle: 15.0, fill: 17.0, sealed: 19.4},
				},
				moment: {
					seconds: 19.4,
					label: '',
					phone: '',
					captions: [
						{from: 0.2, to: 5.0, text: 'You answer Maya with the NTK keyboard.'},
						{from: 5.0, to: 10.0, text: 'Type as usual, then tap Sign.'},
						{from: 10.0, to: 13.7, text: 'The typing goes sealed to the enclave for a check.'},
						{from: 13.7, to: 17.7, text: 'It matches: the keyboard adds the tag.'},
						{from: 17.7, to: 19.4, text: 'Send.'},
					],
					clip: {
						src: 'clips/moment.mp4',
						placeholder: false,
						start: 0,
						parts: [
							{from: 2.2, to: 7.4, speed: 1},
							{from: 7.4, to: 24.8, speed: 6},
							{from: 24.8, to: 36.0, speed: 1},
						],
						loupe: [
							{at: 0, x: 0.5, y: 0.52, w: 1},
							{at: 2.2, x: 0.5, y: 0.52, w: 1},
							{at: 3.0, x: 0.5, y: 0.63, w: 1},
							{at: 17.5, x: 0.5, y: 0.63, w: 1},
							{at: 18.3, x: 0.5, y: 0.6, w: 1},
						],
						note: 'Typed by our test robot',
					},
				},
				stamp: {
					seconds: 24,
					label: '',
					phone: '',
					captions: [
						{from: 0.3, to: 3.8, text: 'Sign sends the new typing, sealed, to the enclave.'},
						{from: 3.8, to: 7.8, text: 'NEAR confirms that the key belongs to your account.'},
						{from: 7.8, to: 13.0, text: 'The enclave compares the new typing with your fingerprint.'},
						{from: 13.0, to: 17.0, text: 'Only the enclave’s key can sign the stamp.'},
						{from: 17.0, to: 20.4, text: 'The tag goes into your text. The stamp is published.'},
						{from: 20.4, to: 24, text: 'Anyone can look it up by its id.'},
					],
					beats: {
						players: 0, sign: 0.6, travel: 1.2, arrive: 3.2, nearAsk: 3.8, nearOk: 5.8, open: 7.8, score: 8.6, press: 13.0, tagBack: 17.0, publish: 18.4, lookup: 20.4, match: 21.8,
					},
				},
				verify: {
					seconds: 33.2,
					label: '',
					phone: 'Maya’s phone',
					captions: [
						{from: 0.2, to: 11.6, text: 'On Maya’s phone, NTK turns the tag into a button. In any app.'},
						{from: 11.6, to: 15.1, text: 'Maya taps it.'},
						{from: 15.1, to: 20.6, text: 'MATCH: the stamp is genuine and the text unchanged.'},
						{from: 20.6, to: 33.2, text: 'Anyone can check it. Change one word and it fails.'},
					],
					clip: {
						src: 'clips/verify.mp4',
						placeholder: false,
						start: 12.0,
						parts: [
							{from: 4.2, to: 5.5, speed: 1},
							{from: 5.5, to: 10.6, speed: 1},
							{from: 10.6, to: 39.5, speed: 12},
							{from: 39.5, to: 44.0, speed: 1},
							{from: 44.0, to: 48.8, speed: 6},
							{from: 48.8, to: 55.9, speed: 1},
						],
						loupe: [
							{at: 0, x: 0.5, y: 0.6, w: 1},
							{at: 0.8, x: 0.5, y: 0.6, w: 1},
							{at: 3.0, x: 0.4, y: 0.693, w: 0.75},
							{at: 11.2, x: 0.4, y: 0.693, w: 0.75},
							{at: 12.0, x: 0.5, y: 0.6, w: 1},
							{at: 13.9, x: 0.5, y: 0.6, w: 1},
							{at: 14.7, x: 0.5, y: 0.38, w: 1},
							{at: 18.4, x: 0.5, y: 0.38, w: 1},
							{at: 19.0, x: 0.5, y: 0.45, w: 1},
							{at: 20.6, x: 0.5, y: 0.45, w: 1},
							{at: 21.2, x: 0.5, y: 0.74, w: 1},
							{at: 22.9, x: 0.5, y: 0.74, w: 1},
							{at: 23.4, x: 0.5, y: 0.42, w: 1},
							{at: 24.2, x: 0.5, y: 0.42, w: 1},
							{at: 24.7, x: 0.5, y: 0.36, w: 1},
							{at: 26.6, x: 0.5, y: 0.36, w: 1},
							{at: 27.3, x: 0.5, y: 0.27, w: 1},
							{at: 31.3, x: 0.5, y: 0.27, w: 1},
							{at: 32.0, x: 0.5, y: 0.33, w: 1},
						],
						note: 'Tapped by our test robot',
					},
					callout: {
						at: 1.4,
						until: 11.6,
						title: 'The NTK button',
						lines: [
							'Works in {app}, and in any other app.',
							'Installed with the NTK keyboard.',
						],
					},
					cycle: {
						at: 3.6,
						every: 2.0,
						slide: 0.5,
						apps: [
							{kind: 'clip', label: 'Messages', src: '', frame: 0, lines: [], target: {x: 0.527, y: 0.677, w: 0.313, h: 0.025}},
							{kind: 'video', label: 'a social feed', src: 'clips/feed.mp4', frame: 2.5, lines: [], target: {x: 0.725, y: 0.595, w: 0.309, h: 0.023}},
							{
								kind: 'forum',
								label: 'a forum',
								src: '',
								frame: 0,
								lines: ['I agree with this, and I typed', 'every word myself.'],
								target: {x: 0.679, y: 0.677, w: 0.313, h: 0.025},
							},
							{
								kind: 'email',
								label: 'email',
								src: '',
								frame: 0,
								lines: ['You asked if I wrote it myself. Yes:', 'Every word of it was mine, typed on this', 'phone by me.'],
								target: {x: 0.434, y: 0.677, w: 0.313, h: 0.025},
							},
						],
					},
				},
				end: {
					seconds: 6,
					label: '',
					phone: '',
					captions: [],
					beats: {keyboard: 0, title: 0.4, links: 1.2},
				},
			},
		}}
	/>
);
