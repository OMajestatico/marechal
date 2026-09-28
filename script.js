(() => {
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => [...r.querySelectorAll(s)];

  if (window.lucide) lucide.createIcons();

  const topbar = qs('#topbar');
  const onScroll = () => topbar?.classList.toggle('scrolled', window.scrollY > 36);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu with scroll position preserved. No dramatic teleportation, humanity has suffered enough.
  const menu = qs('#mobileMenu');
  const menuBtn = qs('#menuBtn');
  const menuClose = qs('#menuClose');
  let lockedY = 0;

  function lockPage() {
    lockedY = window.scrollY;
    document.documentElement.classList.add('menu-open');
    document.body.classList.add('menu-open');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockPage() {
    document.documentElement.classList.remove('menu-open');
    document.body.classList.remove('menu-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, lockedY);
  }

  function openMenu() {
    if (!menu || menu.classList.contains('open')) return;
    lockPage();
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    menuBtn?.setAttribute('aria-expanded', 'true');
  }

  function closeMenu({ navigateTo = null } = {}) {
    if (!menu || !menu.classList.contains('open')) return;
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    menuBtn?.setAttribute('aria-expanded', 'false');

    const finish = () => {
      unlockPage();
      if (navigateTo) {
        const target = qs(navigateTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.setTimeout(finish, 290);
  }

  menuBtn?.addEventListener('click', openMenu);
  menuClose?.addEventListener('click', () => closeMenu());
  menu?.addEventListener('click', (e) => {
    if (e.target === menu) closeMenu();
  });
  qsa('.mobile-menu nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      closeMenu({ navigateTo: a.getAttribute('href') });
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  // Smooth anchor navigation, but only when the human actually clicked a navigation link.
  qsa('a[href^="#"]:not(.mobile-menu nav a)').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      const target = id && qs(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Reveal on view.
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
  qsa('.reveal').forEach(el => io.observe(el));

  // Carousels: one card per gesture/click, exact snapping and dot progress.
  const carouselStates = new Map();

  function carouselItems(track) {
    return [...track.children].filter(el =>
      el.matches('.gallery-card, .review-card, .flavor-card')
    );
  }

  function carouselEnabled(track) {
    if (track.dataset.carouselMode === 'mobile') {
      return matchMedia('(max-width: 680px)').matches;
    }
    return track.scrollWidth > track.clientWidth + 2;
  }

  function maxScroll(track) {
    return Math.max(0, track.scrollWidth - track.clientWidth);
  }

  function targetScroll(track, item) {
    const style = getComputedStyle(item);
    const align = style.scrollSnapAlign || 'start';
    let target;

    if (align.includes('center')) {
      target = item.offsetLeft - (track.clientWidth - item.clientWidth) / 2;
    } else {
      const paddingLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      target = item.offsetLeft - paddingLeft;
    }

    return Math.max(0, Math.min(maxScroll(track), target));
  }

  function nearestIndex(state) {
    const { track, items } = state;
    let best = 0;
    let bestDistance = Infinity;
    items.forEach((item, i) => {
      const d = Math.abs(track.scrollLeft - targetScroll(track, item));
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  }

  function updateCarouselUi(state) {
    const { track, dots, items } = state;
    const enabled = carouselEnabled(track);
    const current = Math.max(0, Math.min(items.length - 1, state.index));

    dots.forEach((dot, i) => {
      const active = i === current;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-current', active ? 'true' : 'false');
    });

    qsa(`[data-carousel-prev="${track.id}"]`).forEach(btn => {
      btn.disabled = !enabled || current <= 0;
    });
    qsa(`[data-carousel-next="${track.id}"]`).forEach(btn => {
      btn.disabled = !enabled || current >= items.length - 1 || track.scrollLeft >= maxScroll(track) - 2;
    });
  }

  function goToCarousel(state, index, behavior = 'smooth') {
    if (!carouselEnabled(state.track)) return;
    const next = Math.max(0, Math.min(state.items.length - 1, index));
    state.index = next;
    state.track.classList.add('is-settling');
    clearTimeout(state.settleTimer);
    state.settleTimer = window.setTimeout(() => {
      state.track.classList.remove('is-settling');
      state.index = nearestIndex(state);
      updateCarouselUi(state);
    }, behavior === 'smooth' ? 520 : 40);
    state.track.scrollTo({ left: targetScroll(state.track, state.items[next]), behavior });
    updateCarouselUi(state);
  }

  function setupCarousel(track) {
    const items = carouselItems(track);
    if (!items.length) return;

    const dotsHost = qs(`[data-carousel-dots="${track.id}"]`);
    const state = { track, items, dots: [], index: 0, scrollingFrame: 0, settleTimer: 0, touchStartIndex: null, touchGestureActive: false, touchNeedsLimit: false };
    carouselStates.set(track.id, state);

    if (dotsHost) {
      dotsHost.replaceChildren();
      items.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Ir para o item ${i + 1} de ${items.length}`);
        dot.addEventListener('click', () => goToCarousel(state, i));
        dotsHost.appendChild(dot);
        state.dots.push(dot);
      });
    }

    let down = false;
    let horizontal = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let startIndex = 0;

    track.addEventListener('pointerdown', e => {
      if (!carouselEnabled(track) || (e.button !== undefined && e.button !== 0)) return;

      // No touch, deixa o navegador fazer o arraste nativo.
      // Isso faz o carrossel acompanhar o dedo pixel por pixel, sem sensação de "botão/swipe mecânico".
      if (e.pointerType === 'touch') return;

      down = true;
      horizontal = false;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      startScroll = track.scrollLeft;
      clearTimeout(state.settleTimer);
      track.classList.remove('is-settling');
      startIndex = state.index = nearestIndex(state);
    });

    track.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || !down) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!horizontal) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          down = false;
          return;
        }
        horizontal = true;
        moved = true;
        track.classList.add('dragging');
        try { track.setPointerCapture?.(e.pointerId); } catch (_) {}
      }

      if (horizontal) {
        e.preventDefault();
        track.scrollLeft = startScroll - dx;
      }
    });

    const finishGesture = e => {
      if (!down && !horizontal) return;
      const dx = (e?.clientX ?? startX) - startX;
      const wasHorizontal = horizontal;
      down = false;
      horizontal = false;
      track.classList.remove('dragging');
      try { if (e) track.releasePointerCapture?.(e.pointerId); } catch (_) {}

      if (!wasHorizontal) return;

      const threshold = Math.min(58, Math.max(34, track.clientWidth * 0.06));
      let next = startIndex;
      if (Math.abs(dx) >= threshold) next += dx < 0 ? 1 : -1;
      goToCarousel(state, next);
    };

    track.addEventListener('pointerup', finishGesture);
    track.addEventListener('pointercancel', finishGesture);

    // Toque nativo no celular. O browser controla o deslocamento durante o gesto;
    // no fim, o snap resolve a posição. scroll-snap-stop evita "voar" vários cards.
    track.addEventListener('touchstart', () => {
      if (!carouselEnabled(track)) return;
      clearTimeout(state.settleTimer);
      track.classList.remove('is-settling');
      state.touchStartIndex = nearestIndex(state);
      state.touchGestureActive = true;
    }, { passive: true });

    track.addEventListener('touchend', () => {
      state.touchGestureActive = false;
      state.touchNeedsLimit = true;
    }, { passive: true });

    track.addEventListener('touchcancel', () => {
      state.touchGestureActive = false;
      state.touchNeedsLimit = false;
    }, { passive: true });

    track.addEventListener('click', e => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
      moved = false;
    }, true);

    // Horizontal wheel/trackpad gestures also advance exactly one card.
    let wheelLock = false;
    track.addEventListener('wheel', e => {
      if (!carouselEnabled(track)) return;
      const horizontalWheel = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!horizontalWheel || wheelLock) return;
      e.preventDefault();
      wheelLock = true;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      goToCarousel(state, state.index + (delta > 0 ? 1 : -1));
      window.setTimeout(() => { wheelLock = false; }, 360);
    }, { passive: false });

    track.addEventListener('scroll', () => {
      if (state.scrollingFrame) return;
      state.scrollingFrame = requestAnimationFrame(() => {
        state.scrollingFrame = 0;
        if (!track.classList.contains('dragging') && !track.classList.contains('is-settling')) {
          state.index = nearestIndex(state);
          updateCarouselUi(state);
        }
      });
    }, { passive: true });

    const settleNativeTouch = () => {
      clearTimeout(state.settleTimer);
      track.classList.remove('is-settling');

      const nearest = nearestIndex(state);

      // Um gesto = no máximo um card. Durante o gesto ele continua livre e acompanha o dedo;
      // a limitação só entra depois que a rolagem/momento terminam.
      if (state.touchNeedsLimit && Number.isInteger(state.touchStartIndex)) {
        const delta = Math.max(-1, Math.min(1, nearest - state.touchStartIndex));
        const limited = state.touchStartIndex + delta;
        state.touchNeedsLimit = false;
        state.touchStartIndex = null;

        if (limited !== nearest) {
          goToCarousel(state, limited, 'smooth');
          return;
        }
      }

      state.touchNeedsLimit = false;
      state.touchStartIndex = null;
      state.index = nearest;
      updateCarouselUi(state);
    };

    if ('onscrollend' in window) {
      track.addEventListener('scrollend', settleNativeTouch, { passive: true });
    } else {
      let nativeScrollTimer = 0;
      track.addEventListener('scroll', () => {
        clearTimeout(nativeScrollTimer);
        nativeScrollTimer = window.setTimeout(settleNativeTouch, 120);
      }, { passive: true });
    }

    updateCarouselUi(state);
  }

  qsa('.carousel-track').forEach(setupCarousel);

  qsa('[data-carousel-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      const state = carouselStates.get(btn.dataset.carouselNext);
      if (state) goToCarousel(state, state.index + 1);
    });
  });

  qsa('[data-carousel-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
      const state = carouselStates.get(btn.dataset.carouselPrev);
      if (state) goToCarousel(state, state.index - 1);
    });
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      carouselStates.forEach(state => {
        state.index = nearestIndex(state);
        updateCarouselUi(state);
      });
    }, 120);
  }, { passive: true });

  // Light 3D tilt only on precise pointers and when reduced motion is not requested.
  const canTilt = matchMedia('(hover:hover) and (pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canTilt) {
    qsa('.tilt-card').forEach(card => {
      const base = getComputedStyle(card).transform === 'none' ? '' : getComputedStyle(card).transform;
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        card.style.transform = `${base} rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateZ(0)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = base; });
    });
  }
})();
