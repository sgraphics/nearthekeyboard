// Thin line icons, drawn on a 24 x 24 grid like the site's (web/lib/icons.js).
import React from 'react';

type P = {size?: number; color: string; stroke?: number; style?: React.CSSProperties};

const Svg: React.FC<P & {children: React.ReactNode}> = ({size = 24, color, stroke = 1.6, style, children}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
		{children}
	</svg>
);

/** A padlock; `open` lifts the shackle (0 closed, 1 open). */
export const Lock: React.FC<P & {open?: number}> = ({open = 0, ...p}) => (
	<Svg {...p}>
		<rect x="5" y="11" width="14" height="10" rx="2" />
		<path d={`M8 ${11 - open * 3} V${7.5 - open * 3} a4 4 0 0 1 8 0 V${11 - open * 6}`} />
		<path d="M12 15 v2.5" />
	</Svg>
);

/** A key, pointing right. */
export const Key: React.FC<P> = (p) => (
	<Svg {...p}>
		<circle cx="7.5" cy="12" r="3.5" />
		<path d="M11 12 H21 M18 12 v3 M15.5 12 v2.2" />
	</Svg>
);

export const Check: React.FC<P> = (p) => (
	<Svg {...p}>
		<path d="M5 12.5 l4.2 4.2 L19 7" />
	</Svg>
);

export const Cross: React.FC<P> = (p) => (
	<Svg {...p}>
		<path d="M6.5 6.5 l11 11 M17.5 6.5 l-11 11" />
	</Svg>
);

/** An eye with a stroke through it: cannot see. */
export const EyeOff: React.FC<P> = (p) => (
	<Svg {...p}>
		<path d="M2.5 12 C5 7.5 8.3 5.5 12 5.5 S19 7.5 21.5 12 C19 16.5 15.7 18.5 12 18.5 S5 16.5 2.5 12 Z" />
		<circle cx="12" cy="12" r="3" />
		<path d="M4 4 L20 20" />
	</Svg>
);

/** A chip, for the TDX processor. */
export const Chip: React.FC<P> = (p) => (
	<Svg {...p}>
		<rect x="6" y="6" width="12" height="12" rx="1.5" />
		<path d="M9 3 v3 M12 3 v3 M15 3 v3 M9 18 v3 M12 18 v3 M15 18 v3 M3 9 h3 M3 12 h3 M3 15 h3 M18 9 h3 M18 12 h3 M18 15 h3" />
	</Svg>
);

/** A shelf of records: public storage. */
export const Records: React.FC<P> = (p) => (
	<Svg {...p}>
		<rect x="4" y="4" width="16" height="5" rx="1" />
		<rect x="4" y="11" width="16" height="5" rx="1" />
		<path d="M4 20 h16" />
	</Svg>
);

/** A magnifier: look up. */
export const Search: React.FC<P> = (p) => (
	<Svg {...p}>
		<circle cx="10.5" cy="10.5" r="6" />
		<path d="M15 15 l5.5 5.5" />
	</Svg>
);

/** Two filled triangles, the fast-forward sign. */
export const FastForward: React.FC<{size: number; color: string}> = ({size, color}) => (
	<svg width={size * 1.5} height={size} viewBox="0 0 36 24">
		<path d="M2 3 L16 12 L2 21 Z M18 3 L32 12 L18 21 Z" fill={color} />
	</svg>
);
