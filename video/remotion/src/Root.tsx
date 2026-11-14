import React from 'react';
import './fonts';
import {LaunchComposition} from './timeline';

// The one composition, "Launch", is registered in timeline.tsx so that Remotion
// Studio saves edits from its sidebar into that file.
export const Root: React.FC = () => <LaunchComposition />;
