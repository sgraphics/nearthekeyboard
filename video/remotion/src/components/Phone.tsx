// The phone at the left of every scene. Its body is one layer under all scenes
// (so it stands still while scenes fade into each other); each scene fills
// the screen (a recorded clip or a drawn screen) and sets the label under it.
import React from 'react';
import {FONT, Look, PHONE, SCREEN, SHADOW_LIFT, smallCaps} from '../theme';

export const PhoneBody: React.FC<{look: Look; opacity?: number}> = ({look, opacity = 1}) => (
	<div
		style={{
			position: 'absolute',
			left: PHONE.x,
			top: PHONE.y,
			width: PHONE.w,
			height: PHONE.h,
			borderRadius: PHONE.radius,
			background: look.phoneBody,
			boxShadow: SHADOW_LIFT,
			opacity,
		}}
	>
		<div
			style={{
				position: 'absolute',
				left: PHONE.bezel,
				top: PHONE.bezel,
				width: PHONE.screenW,
				height: PHONE.screenH,
				borderRadius: PHONE.screenRadius,
				background: look.background,
			}}
		/>
	</div>
);

/** The camera, over whatever the screen shows. */
export const PhoneCamera: React.FC<{look: Look; opacity?: number}> = ({look, opacity = 1}) => (
	<div
		style={{
			position: 'absolute',
			left: PHONE.x + PHONE.w / 2 - 6,
			top: SCREEN.y + 12,
			width: 12,
			height: 12,
			borderRadius: 6,
			background: look.phoneBody,
			opacity,
		}}
	/>
);

/** The screen's area: children use the screen's own coordinates (384 x 862) and are clipped to it. */
export const Screen: React.FC<{children: React.ReactNode}> = ({children}) => (
	<div
		style={{
			position: 'absolute',
			left: SCREEN.x,
			top: SCREEN.y,
			width: SCREEN.w,
			height: SCREEN.h,
			borderRadius: PHONE.screenRadius,
			overflow: 'hidden',
		}}
	>
		{children}
	</div>
);

export const PhoneLabel: React.FC<{look: Look; text: string}> = ({look, text}) =>
	text ? (
		<div style={{position: 'absolute', left: PHONE.x - 80, width: PHONE.w + 160, top: PHONE.labelY - 8, textAlign: 'center', ...smallCaps(look.ink2, 14), fontFamily: FONT}}>
			{text}
		</div>
	) : null;
