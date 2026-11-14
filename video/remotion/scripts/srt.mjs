#!/usr/bin/env node
// Writes the captions of the video as an .srt file, from the same config the
// video burns them in from (src/timeline.tsx) and with the same timing math
// (src/schedule.ts), so the two always agree.
//
//   node scripts/srt.mjs [--out ../out/ntk-launch.srt]
//
// The config's defaultProps are read as a plain literal (the same rule Remotion
// Studio needs to save into them), without running the React code.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {captionTrack, srt, plan, FPS} from '../src/schedule.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => {
	const i = args.indexOf(n);
	return i >= 0 ? args[i + 1] : d;
};
const out = path.resolve(opt('--out', path.join(here, '..', '..', 'out', 'ntk-launch.srt')));
const source = path.join(here, '..', 'src', 'timeline.tsx');

const ast = parse(fs.readFileSync(source, 'utf8'), {sourceType: 'module', plugins: ['typescript', 'jsx']});

/** The value of a literal expression: objects, arrays, strings, numbers, booleans, null. */
function literal(node) {
	switch (node.type) {
		case 'ObjectExpression':
			return Object.fromEntries(
				node.properties.map((p) => {
					if (p.type !== 'ObjectProperty') throw new Error(`not a plain object at line ${p.loc.start.line}`);
					const key = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
					return [key, literal(p.value)];
				}),
			);
		case 'ArrayExpression':
			return node.elements.map(literal);
		case 'StringLiteral':
		case 'NumericLiteral':
		case 'BooleanLiteral':
			return node.value;
		case 'NullLiteral':
			return null;
		case 'UnaryExpression':
			if (node.operator === '-' && node.argument.type === 'NumericLiteral') return -node.argument.value;
			break;
		case 'TemplateLiteral':
			if (node.expressions.length === 0) return node.quasis.map((q) => q.value.cooked).join('');
			break;
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
			return literal(node.expression);
	}
	throw new Error(`defaultProps must be a plain literal; found ${node.type} at line ${node.loc.start.line}`);
}

/** The defaultProps of <Composition id="Launch">. */
function findProps(node) {
	if (!node || typeof node !== 'object') return null;
	if (node.type === 'JSXOpeningElement' && node.name.name === 'Composition') {
		const id = node.attributes.find((a) => a.name?.name === 'id');
		const props = node.attributes.find((a) => a.name?.name === 'defaultProps');
		if (id?.value?.value === 'Launch' && props) return literal(props.value.expression);
	}
	for (const v of Object.values(node)) {
		const found = Array.isArray(v) ? v.map(findProps).find(Boolean) : findProps(v);
		if (found) return found;
	}
	return null;
}

const timeline = findProps(ast.program);
if (!timeline) throw new Error(`no <Composition id="Launch" defaultProps={...}> in ${source}`);
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, srt(timeline));
const cues = captionTrack(timeline);
console.log(`${out}: ${cues.length} captions, video ${(plan(timeline).total / FPS).toFixed(1)} s`);
