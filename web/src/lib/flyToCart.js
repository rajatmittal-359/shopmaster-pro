/**
 * The photo you tapped flies into the bag (E3, 22 Sep 2026).
 *
 * A clone of the product image is appended to <body> at the image's own
 * position and animated (Web Animations API) to the bag icon - the header's
 * on a wide screen, the tab bar's on a phone - shrinking and fading along a
 * slight arc. 600 ms, then removed. Nothing here is state: if the source or
 * the target is missing, or the person prefers reduced motion, it does
 * nothing and the drawer still opens. Target: any element with
 * `data-cart-target` that is visible right now.
 */
export const flyToCart = (from) => {
  if (typeof window === 'undefined' || !from) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const img = from.tagName === 'IMG' ? from : from.querySelector?.('img');
  if (!img?.currentSrc && !img?.src) return;
  const targets = Array.from(document.querySelectorAll('[data-cart-target]')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
  const target = targets[0];
  if (!target) return;
  const a = img.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = document.createElement('img');
  ghost.src = img.currentSrc || img.src;
  ghost.alt = '';
  ghost.className = 'fly-to-cart';
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const scale = Math.max(0.08, Math.min(0.2, 28 / Math.max(a.width, 1)));
  const anim = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(${(1 + scale) / 2})`, opacity: 0.9, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.2, offset: 1 },
    ],
    { duration: 600, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' },
  );
  const done = () => {
    ghost.remove();
    // The bag icon acknowledges the arrival.
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  };
  anim.onfinish = done;
  anim.oncancel = () => ghost.remove();
};
