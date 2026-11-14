// What stays on screen across scenes: the NTK mark and "testnet" at the top
// right; and the scene's small label at the top left of the right side.
import React from 'react';
import {Img, staticFile} from 'remotion';
import {FONT, LABEL_Y, Look, RIGHT, smallCaps} from '../theme';

export const Mark: React.FC<{height: number; style?: React.CSSProperties}> = ({height, style}) => (
	<Img src={staticFile('brand/ntk-mark.svg')} style={{height, width: height * 3.2, display: 'block', ...style}} />
);

export const Chip: React.FC<{look: Look; children: React.ReactNode; style?: React.CSSProperties}> = ({look, children, style}) => (
	<div style={{padding: '8px 11px 7px', borderRadius: 6, background: look.panel, ...smallCaps(look.ink, 13), ...style}}>{children}</div>
);

export const TopRight: React.FC<{look: Look; opacity: number}> = ({look, opacity}) => (
	<div style={{position: 'absolute', right: 1920 - (RIGHT.x + RIGHT.w), top: LABEL_Y - 8, display: 'flex', alignItems: 'center', gap: 22, opacity}}>
		<Chip look={look}>testnet</Chip>
		<Mark height={26} />
	</div>
);

export const SceneLabel: React.FC<{look: Look; number: number; text: string}> = ({look, number, text}) =>
	text ? (
		<div style={{position: 'absolute', left: RIGHT.x, top: LABEL_Y, display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: FONT}}>
			<span style={{...smallCaps(look.orange, 15)}}>{String(number).padStart(2, '0')}</span>
			<span style={{...smallCaps(look.ink, 15)}}>{text}</span>
		</div>
	) : null;
