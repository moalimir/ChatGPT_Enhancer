/**
 * Phase 0 spike — virtualized scroll-to.
 *
 * Question: on a long (virtualized) chat, can we mount + scroll to a message that is NOT
 * currently in the DOM, within a bounded budget, without fighting the user's scroll?
 *
 * Scroll/DOM behavior is identical across content-script worlds, so this runs fine pasted
 * straight into the DevTools console (main world). It is a behavior probe, not auth.
 *
 * Usage (see README for the full procedure):
 *   await spikePhase0.run(targetMessageId, targetTurnIndex, totalTurns)
 *   await spikePhase0.auto()   // picks a middle turn for you and reports
 */
(() => {
  const sel = (id) => `[data-message-id="${CSS.escape(id)}"]`;

  function resolveScrollHost() {
    const main = document.querySelector('main');
    const candidates = [main, document.scrollingElement, document.documentElement, document.body];
    for (const el of candidates) {
      if (el && el.scrollHeight - el.clientHeight > 8) return el;
    }
    return main || document.scrollingElement || document.documentElement;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Bounded targeted navigator: jump proportionally by turn-index ratio, then correct.
  async function navigateTo(messageId, turnIndex, totalTurns, opts = {}) {
    const budgetMs = opts.budgetMs ?? 5000;
    const settleMs = opts.settleMs ?? 250;
    const maxSteps = opts.maxSteps ?? 12;
    const host = resolveScrollHost();
    const t0 = performance.now();
    const log = [];

    const mounted = () => document.querySelector(sel(messageId));
    if (mounted()) {
      mounted().scrollIntoView({ block: 'start', behavior: 'auto' });
      return { ok: true, mountedInitially: true, steps: 0, ms: 0, log };
    }

    // Abort if the user scrolls while we drive.
    let userInterrupted = false;
    let programmatic = false;
    const onScroll = () => { if (!programmatic) userInterrupted = true; };
    host.addEventListener('scroll', onScroll, { passive: true });

    const ratio = totalTurns > 1 ? Math.min(1, Math.max(0, turnIndex / (totalTurns - 1))) : 0;
    let lo = 0, hi = 1; // proportional search window over scrollable range
    let steps = 0;

    try {
      // First guess: jump to the index ratio.
      let guess = ratio;
      while (steps < maxSteps && performance.now() - t0 < budgetMs) {
        if (userInterrupted) return { ok: false, reason: 'user-scroll', steps, ms: Math.round(performance.now() - t0), log };
        const target = Math.round((host.scrollHeight - host.clientHeight) * guess);
        programmatic = true;
        host.scrollTo({ top: target, behavior: 'auto' });
        await sleep(settleMs); // let virtualization mount around the new position
        programmatic = false;
        steps++;

        const el = mounted();
        log.push({ step: steps, guess: +guess.toFixed(3), found: !!el });
        if (el) {
          programmatic = true;
          el.scrollIntoView({ block: 'start', behavior: 'auto' });
          programmatic = false;
          return { ok: true, mountedInitially: false, steps, ms: Math.round(performance.now() - t0), log };
        }

        // Correct: use the nearest mounted turn to decide direction.
        const mountedIds = [...document.querySelectorAll('[data-message-id]')];
        const here = host.scrollTop / Math.max(1, host.scrollHeight - host.clientHeight);
        // Heuristic: compare our position to the desired ratio and tighten the window.
        if (here < ratio) { lo = guess; } else { hi = guess; }
        guess = (lo + hi) / 2;
        if (Math.abs(here - ratio) < 0.002) break; // converged but not found → likely DOM/id mismatch
      }
      return { ok: false, reason: 'not-mounted-within-budget', steps, ms: Math.round(performance.now() - t0), log };
    } finally {
      host.removeEventListener('scroll', onScroll);
    }
  }

  // Convenience: pick a middle message from the rendered set is useless (it's mounted), so
  // auto() asks you to provide an unmounted id; if you have the API transcript, pass index.
  async function auto() {
    const ids = [...document.querySelectorAll('[data-message-id]')].map((n) => n.getAttribute('data-message-id'));
    console.log('[PHASE0-SCROLL] Currently-mounted message ids:', ids.length);
    console.log('[PHASE0-SCROLL] To test the HARD case, fetch the conversation from the API,');
    console.log('[PHASE0-SCROLL] pick a node id that is NOT in the list above (a middle turn),');
    console.log('[PHASE0-SCROLL] then: await spikePhase0.run("<thatId>", <itsIndex>, <totalTurns>)');
    return ids;
  }

  window.spikePhase0 = { run: navigateTo, auto, resolveScrollHost };
  console.log('[PHASE0-SCROLL] loaded. Run spikePhase0.auto() for instructions.');
})();
