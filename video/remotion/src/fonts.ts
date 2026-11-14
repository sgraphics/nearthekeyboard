// Inter (variable, 100 to 900), self-hosted in public/fonts/ under the SIL Open
// Font License, the same file the site serves. Rendering waits until it is loaded.
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

export const fontsReady = loadFont({
	family: 'Inter',
	url: staticFile('fonts/InterVariable.woff2'),
	weight: '100 900',
	style: 'normal',
	display: 'block',
});
