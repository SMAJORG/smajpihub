let activeVideo: HTMLVideoElement | null = null;
export const communityVideoReleaseEvent = "smaj-community-video-release";
export const communityVideoViewerStateEvent = "smaj-community-video-viewer-state";

export const setCommunityVideoViewerOpen = (open: boolean) => {
  window.dispatchEvent(new CustomEvent(communityVideoViewerStateEvent, { detail: open }));
};

export const claimCommunityVideo = (video: HTMLVideoElement) => {
  if (activeVideo && activeVideo !== video) activeVideo.pause();
  activeVideo = video;
};

export const releaseCommunityVideo = (video: HTMLVideoElement) => {
  const wasActive = activeVideo === video;
  if (wasActive) activeVideo = null;
  video.pause();
  if (wasActive) document.dispatchEvent(new Event(communityVideoReleaseEvent));
};
