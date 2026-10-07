// inject.js - ดักจับการแอบเปิดแท็บใหม่
(function() {
  const originalOpen = window.open;

  window.open = function(url, target, features) {
    if (typeof url === 'string') {
      const isExternal = !url.includes(window.location.hostname);
      const isSuspicious = /(bet|slot|ufa|game|line|affiliate|pop|\?ref=|\/go\/|\/out\/)/i.test(url);

      if (isExternal && isSuspicious) {
        console.warn('[AdShield Master] สกัดกั้นการเปิดแท็บใหม่:', url);
        return null; // ปฏิเสธการเปิด
      }
    }
    return originalOpen.call(window, url, target, features);
  };
})();