// Render settings for `npm run render` and Remotion Studio's render button.
// https://www.remotion.dev/docs/config
import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
// PNG frames and BT.709 keep the palette's colours exact through the encode
// (JPEG frames give a full-range file that some players and X shift).
Config.setVideoImageFormat('png');
Config.setColorSpace('bt709');
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);
