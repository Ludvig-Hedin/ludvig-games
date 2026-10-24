/**
 * Render a native 2:3 cell from the portrait atlas without stretching it.
 * SVG viewBox cropping keeps one uniform scale at every container size and
 * does not require Canvas readback, asynchronous decoding, or network assets.
 */
export function portraitMarkup(horse) {
  const index = Number.isInteger(horse?.portrait) && horse.portrait >= 0 && horse.portrait < 6
    ? horse.portrait : 0;
  const x = (index % 3) * 418;
  const y = Math.floor(index / 3) * 627;
  return `<svg class="horse-portrait" viewBox="${x} ${y} 418 627" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false"><image href="./assets/horses.webp" width="1254" height="1254" /></svg>`;
}
