import React from 'react';
import './fonts';
import {ArchitectureStill} from './Architecture';
import {LaunchComposition} from './timeline';

// "Launch" is registered in timeline.tsx so that Remotion Studio saves edits from
// its sidebar into that file. "Architecture" is a still for the thread on X.
export const Root: React.FC = () => (
	<>
		<LaunchComposition />
		<ArchitectureStill />
	</>
);
