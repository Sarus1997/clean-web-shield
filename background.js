const RULESET_ID = "ad_rules";
const SITE_RULE_ID_START = 10000;

function normalizeHost(value) {
  const input = value.trim().replace(/^\*\./, "");
  if (!input) return null;

  try {
    const host = new URL(input.includes("://") ? input : `https://${input}`).hostname
      .toLowerCase()
      .replace(/\.$/, "");
    if (!host || !host.includes(".") || host.includes("*")) return null;
    return host;
  } catch {
    return null;
  }
}

async function getState() {
  const state = await chrome.storage.local.get({
    enabled: true,
    disabledSites: []
  });
  return {
    enabled: state.enabled !== false,
    disabledSites: [...new Set(
      state.disabledSites.map(normalizeHost).filter(Boolean)
    )]
  };
}

async function syncRules(state) {
  const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
  const enableRulesetIds = state.enabled && !enabledRulesets.includes(RULESET_ID)
    ? [RULESET_ID]
    : [];
  const disableRulesetIds = !state.enabled && enabledRulesets.includes(RULESET_ID)
    ? [RULESET_ID]
    : [];

  if (enableRulesetIds.length || disableRulesetIds.length) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds,
      disableRulesetIds
    });
  }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules
    .filter(rule => rule.id >= SITE_RULE_ID_START)
    .map(rule => rule.id);
  const addRules = state.disabledSites.map((domain, index) => ({
    id: SITE_RULE_ID_START + index,
    priority: 2,
    action: { type: "allow" },
    condition: { initiatorDomains: [domain] }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

async function updateState(changes) {
  const current = await getState();
  const next = {
    enabled: changes.enabled === undefined ? current.enabled : changes.enabled,
    disabledSites: changes.disabledSites === undefined
      ? current.disabledSites
      : changes.disabledSites
  };
  await chrome.storage.local.set(next);
  await syncRules(next);
  return next;
}

chrome.runtime.onInstalled.addListener(() => {
  getState()
    .then(syncRules)
    .catch(error => console.error("Clean Web Shield could not initialize rules:", error));
});

chrome.runtime.onStartup.addListener(() => {
  getState()
    .then(syncRules)
    .catch(error => console.error("Clean Web Shield could not restore rules:", error));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "GET_STATE") {
      return getState();
    }

    if (message.type === "SET_ENABLED" && typeof message.enabled === "boolean") {
      return updateState({ enabled: message.enabled });
    }

    if (message.type === "SET_SITE_DISABLED") {
      const host = normalizeHost(message.host);
      if (!host || typeof message.disabled !== "boolean") {
        throw new Error("กรุณาระบุชื่อเว็บไซต์ให้ถูกต้อง");
      }

      const state = await getState();
      const disabledSites = new Set(state.disabledSites);
      if (message.disabled) disabledSites.add(host);
      else disabledSites.delete(host);
      return updateState({ disabledSites: [...disabledSites] });
    }

    if (message.type === "RESET_SITES") {
      return updateState({ disabledSites: [] });
    }

    throw new Error("ไม่รู้จักคำสั่งที่ร้องขอ");
  })()
    .then(result => sendResponse({ ok: true, state: result }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
