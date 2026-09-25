import { registerPlugin } from "@capacitor/core";

export type SmajMediaPlugin = {
  enterLandscape(): Promise<void>;
  exitLandscape(): Promise<void>;
  enterPictureInPicture(): Promise<{ entered: boolean }>;
};

export const SmajMedia = registerPlugin<SmajMediaPlugin>("SmajMedia");
