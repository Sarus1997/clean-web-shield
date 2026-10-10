const globalToggle = document.getElementById("global-toggle");
const globalStatus = document.getElementById("global-status");
const currentHostLabel = document.getElementById("current-host");
const siteToggle = document.getElementById("site-toggle");
const siteInput = document.getElementById("site-input");
const siteList = document.getElementById("site-list");
const emptyList = document.getElementById("empty-list");
const errorLabel = document.getElementById("error");

let state = { enabled: true, disabledSites: [] };
let currentHost = null;

function showError(message) {
  errorLabel.textContent = message;
  errorLabel.hidden = !message;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "ทำรายการไม่สำเร็จ");
  state = response.state;
  render();
}

function isSiteDisabled(host) {
  return state.disabledSites.includes(host);
}

function render() {
  globalToggle.checked = state.enabled;
  globalStatus.textContent = state.enabled ? "ทำงานอยู่" : "ปิดการป้องกันทุกเว็บไซต์";

  if (currentHost) {
    const disabled = isSiteDisabled(currentHost);
    currentHostLabel.textContent = currentHost;
    siteToggle.disabled = !state.enabled;
    siteToggle.textContent = disabled
      ? "เปิดการป้องกันเว็บนี้"
      : "ปิดการป้องกันเว็บนี้";
  } else {
    currentHostLabel.textContent = "ไม่สามารถใช้กับหน้านี้ได้";
    siteToggle.disabled = true;
  }

  siteList.replaceChildren();
  for (const host of state.disabledSites) {
    const row = document.createElement("li");
    row.className = "site-row";
    const label = document.createElement("span");
    label.textContent = host;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "เปิด";
    button.setAttribute("aria-label", `เปิดการป้องกัน ${host}`);
    button.addEventListener("click", () => runAction(() =>
      send({ type: "SET_SITE_DISABLED", host, disabled: false })
    ));
    row.append(label, button);
    siteList.append(row);
  }
  emptyList.hidden = state.disabledSites.length > 0;
}

async function runAction(action) {
  showError("");
  try {
    await action();
  } catch (error) {
    render();
    showError(error.message);
  }
}

globalToggle.addEventListener("change", () => runAction(() =>
  send({ type: "SET_ENABLED", enabled: globalToggle.checked })
));

siteToggle.addEventListener("click", () => {
  if (!currentHost) return;
  runAction(() => send({
    type: "SET_SITE_DISABLED",
    host: currentHost,
    disabled: !isSiteDisabled(currentHost)
  }));
});

document.getElementById("add-site-form").addEventListener("submit", event => {
  event.preventDefault();
  runAction(async () => {
    await send({
      type: "SET_SITE_DISABLED",
      host: siteInput.value,
      disabled: true
    });
    siteInput.value = "";
  });
});

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try {
        currentHost = new URL(tab.url).hostname.toLowerCase();
      } catch {
        currentHost = null;
      }
    }
    await send({ type: "GET_STATE" });
  } catch (error) {
    showError(error.message);
  }
}

initialize();
