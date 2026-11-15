import { RenderedVideoRect } from '../types';

/**
 * Calculates the exact bounding box of the rendered video within an HTMLVideoElement
 * that has CSS object-fit: contain applied.
 */
export function getRenderedVideoRect(video: HTMLVideoElement): RenderedVideoRect {
  const containerWidth = video.clientWidth;
  const containerHeight = video.clientHeight;

  const videoWidth = video.videoWidth || containerWidth;
  const videoHeight = video.videoHeight || containerHeight;

  if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;

  let renderedWidth = containerWidth;
  let renderedHeight = containerHeight;
  let left = 0;
  let top = 0;

  if (containerAspect > videoAspect) {
    // Pillarboxed (bars on left and right)
    renderedHeight = containerHeight;
    renderedWidth = containerHeight * videoAspect;
    left = (containerWidth - renderedWidth) / 2;
    top = 0;
  } else {
    // Letterboxed (bars on top and bottom)
    renderedWidth = containerWidth;
    renderedHeight = containerWidth / videoAspect;
    left = 0;
    top = (containerHeight - renderedHeight) / 2;
  }

  return { left, top, width: renderedWidth, height: renderedHeight };
}

/**
 * Converts a mouse event on the host's screen into normalized 0..1 coordinates
 * relative to the shared presentation canvas. Allows the laser pointer to glide
 * across the entire screen smoothly without deactivating on margins.
 */
export function clientToNormalized(
  clientX: number,
  clientY: number,
  video: HTMLVideoElement
): { x: number; y: number; isInsideContent: boolean } {
  const videoRect = video.getBoundingClientRect();
  const rendered = getRenderedVideoRect(video);

  // Position relative to the <video> element
  const relX = clientX - videoRect.left;
  const relY = clientY - videoRect.top;

  // Normalize and clamp smoothly between 0 and 1
  const x = rendered.width > 0 ? Math.max(0, Math.min(1, (relX - rendered.left) / rendered.width)) : 0;
  const y = rendered.height > 0 ? Math.max(0, Math.min(1, (relY - rendered.top) / rendered.height)) : 0;

  return { x, y, isInsideContent: true };
}

/**
 * Converts normalized 0..1 coordinates into pixel coordinates relative to the container element,
 * accounting for both video element positioning (flexbox / margin) and internal letterboxing.
 */
export function normalizedToContainerPixels(
  normX: number,
  normY: number,
  video: HTMLVideoElement,
  container: HTMLElement | null
): { x: number; y: number } {
  const videoRect = video.getBoundingClientRect();
  const rendered = getRenderedVideoRect(video);

  const videoPixelX = rendered.left + normX * rendered.width;
  const videoPixelY = rendered.top + normY * rendered.height;

  if (!container) {
    return { x: videoPixelX, y: videoPixelY };
  }

  const containerRect = container.getBoundingClientRect();

  return {
    x: (videoRect.left - containerRect.left) + videoPixelX,
    y: (videoRect.top - containerRect.top) + videoPixelY
  };
}
