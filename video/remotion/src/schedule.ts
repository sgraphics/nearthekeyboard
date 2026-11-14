// Timing math shared by the video and scripts/srt.mjs. Pure: no React, no
// Remotion, only a type import, so Node can run it as it is (type stripping).
import type {Timeline} from './timeline';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Every scene the timeline describes. */
export const SCENES = ['hero', 'problem', 'login', 'enroll', 'seal', 'moment', 'stamp', 'verify', 'end'] as const;
export type SceneId = (typeof SCENES)[number];

/**
 * The scenes that play, in order. 'problem' (Maya's chat with the question, after the hero)
 * was cut on 2026-11-14 so that the hero leads straight into the login; its settings stay
 * in timeline.tsx, and putting it back here plays it again.
 */
export const SCENE_ORDER: readonly SceneId[] = ['hero', 'login', 'enroll', 'seal', 'moment', 'stamp', 'verify', 'end'];

export type ScenePlan = {id: SceneId; index: number; from: number; frames: number};

export const toFrames = (seconds: number) => Math.round(seconds * FPS);

/** Where each scene starts and how long it runs, in frames. Scenes overlap by `transition`. */
export function plan(t: Timeline): {scenes: ScenePlan[]; overlap: number; total: number} {
	const overlap = toFrames(t.transition);
	const scenes: ScenePlan[] = [];
	let from = 0;
	SCENE_ORDER.forEach((id, index) => {
		const frames = Math.max(2, toFrames(t.scenes[id].seconds));
		scenes.push({id, index, from, frames});
		from += frames - Math.min(overlap, frames - 1);
	});
	const last = scenes[scenes.length - 1];
	return {scenes, overlap, total: last.from + last.frames};
}

export const totalFrames = (t: Timeline) => plan(t).total;

export type Cue = {from: number; to: number; text: string; scene: SceneId};

/** Every caption with absolute frames. A caption ends where the next one starts, so two never show at once. */
export function captionTrack(t: Timeline): Cue[] {
	const cues: Cue[] = [];
	for (const s of plan(t).scenes) {
		const scene = t.scenes[s.id];
		for (const c of scene.captions) {
			const from = s.from + toFrames(Math.max(0, c.from));
			const to = s.from + toFrames(Math.min(c.to, scene.seconds));
			if (to > from && c.text.trim()) cues.push({from, to, text: c.text.trim(), scene: s.id});
		}
	}
	cues.sort((a, b) => a.from - b.from);
	for (let i = 0; i + 1 < cues.length; i++) cues[i].to = Math.min(cues[i].to, cues[i + 1].from);
	return cues.filter((c) => c.to > c.from);
}

export type Part = {from: number; to: number; speed: number};
export type PartPlan = {start: number; frames: number; srcFrom: number; srcTo: number; speed: number};

/** A clip's parts laid out in scene frames: where each starts, how long it plays, which source frames. */
export function clipPlan(clip: {start: number; parts: Part[]}): {parts: PartPlan[]; start: number; end: number} {
	const start = toFrames(clip.start);
	let at = start;
	const parts: PartPlan[] = [];
	for (const p of clip.parts) {
		const speed = Math.max(0.25, p.speed);
		const frames = Math.max(1, Math.round(((p.to - p.from) * FPS) / speed));
		parts.push({start: at, frames, srcFrom: toFrames(p.from), srcTo: toFrames(p.to), speed});
		at += frames;
	}
	return {parts, start, end: at};
}

/** The speed at a scene frame: 1 outside the parts and in normal parts. */
export function speedAt(parts: PartPlan[], frame: number): number {
	const p = parts.find((x) => frame >= x.start && frame < x.start + x.frames);
	return p ? p.speed : 1;
}

/** Seconds as an SRT time, 00:01:02,345. */
export function srtTime(frames: number): string {
	const ms = Math.round((frames / FPS) * 1000);
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	const s = Math.floor((ms % 60000) / 1000);
	const pad = (v: number, w = 2) => String(v).padStart(w, '0');
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Wrap for the SRT file: at most `width` characters a line, two lines as even as possible, explicit line breaks kept. */
export function wrap(text: string, width = 42): string {
	return text
		.split('\n')
		.map((para) => {
			const words = para.split(/\s+/).filter(Boolean);
			if (words.join(' ').length <= width) return words.join(' ');
			// two lines of about the same length when they fit, breaking after punctuation where it can
			let best = 0;
			let bestCost = Infinity;
			for (let i = 1; i < words.length; i++) {
				const first = words.slice(0, i).join(' ');
				const second = words.slice(i).join(' ');
				if (first.length > width || second.length > width) continue;
				const cost = Math.max(first.length, second.length) - (/[.,:;!?]$/.test(first) ? 8 : 0);
				if (cost < bestCost) {
					bestCost = cost;
					best = i;
				}
			}
			if (best > 0) return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
			// longer: fill each line
			const lines: string[] = [];
			let line = '';
			for (const word of words) {
				if (line && (line + ' ' + word).length > width) {
					lines.push(line);
					line = word;
				} else line = line ? line + ' ' + word : word;
			}
			if (line) lines.push(line);
			return lines.join('\n');
		})
		.join('\n');
}

/** The whole SRT file. */
export function srt(t: Timeline): string {
	return (
		captionTrack(t)
			.map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${wrap(c.text)}\n`)
			.join('\n')
	);
}
