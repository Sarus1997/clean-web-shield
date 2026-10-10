// content.js - Vanish Edition (หายไปทันที ไม่กวนใจ)

const isYouTube = window.location.hostname.includes('youtube.com');
let observer = null;
let controllerTimer = null;
let active = false;
const originalVideoState = new Map();

function rememberVideoState(video) {
  if (!originalVideoState.has(video)) {
    originalVideoState.set(video, {
      muted: video.muted,
      playbackRate: video.playbackRate,
      opacity: video.style.opacity
    });
  }
}

function restoreVideoState() {
  for (const [video, state] of originalVideoState) {
    video.muted = state.muted;
    video.playbackRate = state.playbackRate;
    video.style.opacity = state.opacity;
  }
  originalVideoState.clear();
}

// ==============================================================
// 1. YouTube Module (ทำงานปกติ ปลอดภัยกับคลิปเพลง 100%)
// ==============================================================
function handleYouTubeSafely() {
  const player = document.querySelector('#movie_player, .html5-video-player');
  const video = document.querySelector('video');
  if (!player || !video) return;

  const isAd = player.classList.contains('ad-showing') || 
               player.classList.contains('ad-interrupting') ||
               document.querySelector('.video-ads.ytp-ad-module')?.children.length > 0;

  if (isAd) {
    rememberVideoState(video);
    video.muted = true;
    video.playbackRate = 16.0;
    if (isFinite(video.duration) && video.duration > 0) {
      try { video.currentTime = video.duration - 0.1; } catch (e) {}
    }
    const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
    if (skipBtn) skipBtn.click();
  } else {
    if (video.playbackRate !== 1.0) video.playbackRate = 1.0;
  }

  document.querySelectorAll('ytd-ad-slot-renderer, #player-ads, .ytp-ad-overlay-container').forEach(el => el.remove());
}

// ==============================================================
// 2. เว็บทั่วไป: ลบโฆษณาให้ "หายวับ" ไปทันที
// ==============================================================
function vanishPirateAds() {
  const currentHost = window.location.hostname;

  // A. จัดการคลิปโฆษณาในเครื่องเล่นหนัง (Instant Skip & Hide)
  document.querySelectorAll('video').forEach(video => {
    const d = video.duration;

    // ถ้าความยาวคลิปเข้าข่ายโฆษณา (1 ถึง 200 วินาที)
    if (d && !isNaN(d) && isFinite(d) && d > 0 && d <= 200) {
      rememberVideoState(video);
      // 1. ซ่อนภาพและปิดเสียงทันที (ไม่ให้โผล่มาให้เห็นหรือได้ยิน)
      video.style.opacity = '0';
      video.muted = true;
      video.playbackRate = 16.0;

      // 2. วาร์ปไปที่วินาทีสุดท้าย บังคับให้ตัดจบ 0 วิ
      try { 
        video.currentTime = d; 
      } catch (e) {}

    } else if (d > 200) {
      rememberVideoState(video);
      // เมื่อเข้าเนื้อหาหนังจริง (เกิน 200 วินาที) -> เปิดภาพปกติ คืนค่าความเร็ว
      video.style.opacity = '1';
      if (video.playbackRate !== 1.0) video.playbackRate = 1.0;
      video.muted = false;
    }
  });

  // B. ลบกล่องคลุมโฆษณา VAST / IMA SDK / Player Ads ทันที
  document.querySelectorAll(
    '.jw-ad, .jw-ad-ui, .ima-ad-container, [class*="preroll"], [id*="ad_wrapper"], [class*="ad-container"]'
  ).forEach(box => {
    // ลบเฉพาะกล่องที่ไม่มีตัวเล่นหนังจริงอยู่ข้างใน
    if (!box.querySelector('video') || box.classList.contains('jw-ad')) {
      box.remove();
    }
  });

  // C. ลบป้ายลอยข้างจอ ซ้าย-ขวา แบบเกลี้ยงตับ
  document.querySelectorAll('div, aside, section').forEach(el => {
    if (el.closest('video, .jwplayer, .video-js, [class*="player"]')) return;
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') {
      const rect = el.getBoundingClientRect();
      if ((rect.left <= 25 || rect.right >= (window.innerWidth - 25)) && el.querySelector('img, a') && rect.top > 40) {
        el.remove();
      }
    }
  });

  // D. ลบกองทัพแบนเนอร์ฝังในเนื้อหา (REDKONG, JUAD, สล็อต ฯลฯ)
  document.querySelectorAll('a[target="_blank"]').forEach(a => {
    if (a.closest('video, [class*="player"]')) return;
    const img = a.querySelector('img');
    const href = a.getAttribute('href') || '';
    if (img) {
      const isExternal = !href.includes(currentHost) && !href.startsWith('/');
      const isBanner = img.offsetWidth > 150 || (img.src || '').includes('.gif');
      if (isBanner && isExternal) {
        const wrapper = a.closest('div, center, li') || a;
        if (wrapper.querySelectorAll('video, iframe').length === 0) wrapper.remove();
        else a.remove();
      }
    }
  });

  // E. ลบแผ่นใสที่วางซ้อนบนจอหนัง (กดแล้วเด้งไปเว็บอื่น)
  document.querySelectorAll('video, iframe').forEach(player => {
    const vRect = player.getBoundingClientRect();
    document.querySelectorAll('a').forEach(overlay => {
      if (overlay.contains(player)) return;
      const oRect = overlay.getBoundingClientRect();
      const isOver = !(oRect.right < vRect.left || oRect.left > vRect.right || oRect.bottom < vRect.top || oRect.top > vRect.bottom);
      if (isOver && overlay.href && !overlay.href.includes(currentHost)) {
        overlay.remove();
      }
    });
  });
}

// ==============================================================
// 3. Main Loop ทำงานทันทีและตรวจสอบตลอดเวลา
// ==============================================================
function mainController() {
  if (isYouTube) {
    handleYouTubeSafely();
  } else {
    vanishPirateAds();
  }
}

function startShield() {
  if (active) return;
  active = true;
  document.documentElement.setAttribute('data-clean-web-shield', '');

  controllerTimer = setInterval(mainController, 200);
  observer = new MutationObserver(mainController);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mainController();
}

function stopShield() {
  if (!active) return;
  active = false;
  clearInterval(controllerTimer);
  observer.disconnect();
  observer = null;
  controllerTimer = null;
  document.documentElement.removeAttribute('data-clean-web-shield');
  restoreVideoState();
}

function applySiteSettings(settings) {
  const disabledSites = settings.disabledSites || [];
  const siteDisabled = disabledSites.some(host =>
    window.location.hostname === host || window.location.hostname.endsWith(`.${host}`)
  );
  if (settings.enabled !== false && !siteDisabled) startShield();
  else stopShield();
}

chrome.storage.local.get({ enabled: true, disabledSites: [] }, applySiteSettings);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (changes.enabled || changes.disabledSites)) {
    chrome.storage.local.get({ enabled: true, disabledSites: [] }, applySiteSettings);
  }
});