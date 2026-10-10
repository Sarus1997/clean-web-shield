const globalToggle = document.getElementById("global-toggle");
const globalStatus = document.getElementById("global-status");
const currentHostLabel = document.getElementById("current-host");
const siteToggle = document.getElementById("site-toggle");
const siteInput = document.getElementById("site-input");
const siteList = document.getElementById("site-list");
const emptyList = document.getElementById("empty-list");
const errorLabel = document.getElementById("error");
const themeToggle = document.getElementById("theme-toggle");
const scanButton = document.getElementById("scan-button");
const scanResult = document.getElementById("scan-result");

let state = { enabled: true, disabledSites: [] };
let currentHost = null;
let currentUrl = null;

function showError(message) {
  errorLabel.textContent = message;
  errorLabel.hidden = !message;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "ทำรายการไม่สำเร็จ");
  state = { ...state, ...response.state };
  render();
}

function isSiteDisabled(host) {
  return state.disabledSites.includes(host);
}

function render() {
  document.documentElement.dataset.theme = state.theme === "dark" ? "dark" : "light";
  themeToggle.textContent = state.theme === "dark" ? "ธีมสว่าง" : "ธีมมืด";
  themeToggle.setAttribute("aria-pressed", String(state.theme === "dark"));
  globalToggle.checked = state.enabled;
  globalStatus.textContent = state.enabled ? "ทำงานอยู่" : "ปิดการป้องกันทุกเว็บไซต์";

  if (currentHost) {
    const disabled = isSiteDisabled(currentHost);
    currentHostLabel.textContent = currentHost;
    scanButton.disabled = false;
    siteToggle.disabled = !state.enabled;
    siteToggle.textContent = disabled
      ? "เปิดการป้องกันเว็บนี้"
      : "ปิดการป้องกันเว็บนี้";
  } else {
    currentHostLabel.textContent = "ไม่สามารถใช้กับหน้านี้ได้";
    siteToggle.disabled = true;
    scanButton.disabled = true;
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

function scanCurrentSite() {
  scanResult.replaceChildren();
  scanResult.hidden = false;
  scanResult.className = "scan-result";

  if (!currentUrl || !currentHost) {
    scanResult.textContent = "ไม่สามารถสแกนหน้านี้ได้";
    scanResult.classList.add("risk-medium");
    return;
  }

  let score = 0;
  const findings = [];
  const url = new URL(currentUrl);
  const host = url.hostname.toLowerCase();

  if (url.protocol !== "https:") {
    score += 2;
    findings.push("การเชื่อมต่อไม่ใช้ HTTPS");
  }
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    score += 3;
    findings.push("เว็บไซต์ใช้หมายเลข IP แทนชื่อโดเมน");
  }
  if (host.includes("xn--")) {
    score += 3;
    findings.push("ชื่อโดเมนมีอักขระแปลงรูปแบบ (punycode) ซึ่งอาจเลียนแบบโดเมนอื่น");
  }
  if (host.split(".").length > 4) {
    score += 1;
    findings.push("ชื่อโดเมนมีหลายระดับกว่าปกติ");
  }
  if (/(login|signin|verify|account|secure|wallet|password|update|claim|bonus)/i.test(host)) {
    score += 1;
    findings.push("ชื่อโดเมนมีคำที่มักใช้ล่อให้เข้าสู่ระบบหรือรับข้อเสนอ");
  }
  if (url.username || url.password) {
    score += 3;
    findings.push("URL มีข้อมูลชื่อผู้ใช้หรือรหัสผ่านฝังอยู่");
  }

  const level = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  scanResult.classList.add(`risk-${level}`);
  const title = document.createElement("strong");
  title.textContent = level === "high"
    ? "พบสัญญาณเสี่ยงหลายรายการ"
    : level === "medium"
      ? "ควรตรวจสอบเว็บไซต์นี้"
      : "ไม่พบสัญญาณเสี่ยงจาก URL";
  scanResult.append(title);

  if (findings.length) {
    const list = document.createElement("ul");
    for (const finding of findings) {
      const item = document.createElement("li");
      item.textContent = finding;
      list.append(item);
    }
    scanResult.append(list);
  }

  const note = document.createElement("small");
  note.textContent = "ตรวจสอบจาก URL ในเครื่องเท่านั้น ไม่ได้ยืนยันความปลอดภัยของเว็บไซต์";
  scanResult.append(note);
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

themeToggle.addEventListener("click", () => runAction(async () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  await chrome.storage.local.set({ theme: state.theme });
  render();
}));

scanButton.addEventListener("click", scanCurrentSite);

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try {
        currentUrl = tab.url;
        const url = new URL(tab.url);
        if (url.protocol === "http:" || url.protocol === "https:") {
          currentHost = url.hostname.toLowerCase();
        }
      } catch {
        currentHost = null;
      }
    }
    const [response, preferences] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_STATE" }),
      chrome.storage.local.get({ theme: "light" })
    ]);
    if (!response?.ok) throw new Error(response?.error || "โหลดการตั้งค่าไม่สำเร็จ");
    state = { ...response.state, theme: preferences.theme };
    render();
  } catch (error) {
    showError(error.message);
  }
}

initialize();
