"use strict";

const $ = id => document.getElementById(id);

const el = {
  hero: $("hero"),
  title: $("statusTitle"),
  description: $("statusDescription"),
  toggle: $("masterToggle"),
  scanBtn: $("scanBtn"),
  scanResult: $("scanResult"),
  siteCount: $("siteCount"),
  protection: $("protectionStatus"),
  input: $("siteInput"),
  form: $("siteForm"),
  addBtn: $("addBtn"),
  list: $("siteList"),
  reset: $("resetBtn"),
  toast: $("toast")
};

let state = { enabled: true, disabledSites: [] };
let busy = false;
let scanBusy = false;
let toastTimer = null;

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
}

function normalizeHost(value) {
  if (typeof value !== "string") return null;
  const input = value.trim().replace(/^\*\./, "");
  if (!input) return null;

  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || !host.includes(".") || host.includes("*") || host.length > 253) return null;
    return host;
  } catch {
    return null;
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "เกิดข้อผิดพลาด"));
        return;
      }
      resolve(response.state);
    });
  });
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs[0]);
    });
  });
}

function requestPageScan(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE_SECURITY" }, { frameId: 0 }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error("ตรวจหน้านี้ไม่ได้ อาจเป็นหน้าระบบของเบราว์เซอร์หรือยังโหลดไม่เสร็จ"));
        return;
      }
      if (!response?.ok || !response.result) {
        reject(new Error(response?.error || "ไม่สามารถตรวจสอบหน้านี้ได้"));
        return;
      }
      resolve(response.result);
    });
  });
}

function renderScanResult(result) {
  const findings = [];
  if (!result.secureTransport) findings.push("การเชื่อมต่อหน้านี้ไม่ได้ใช้ HTTPS");
  if (result.insecureForms > 0) {
    findings.push(`พบ ${result.insecureForms} ฟอร์มที่ส่งข้อมูลผ่าน HTTP`);
  }
  if (result.mixedContentResources > 0) {
    findings.push(`พบ ${result.mixedContentResources} ทรัพยากรที่โหลดผ่าน HTTP`);
  }

  const summary = document.createElement("strong");
  summary.textContent = findings.length
    ? `พบ ${findings.length} จุดที่ควรตรวจสอบ`
    : "ไม่พบสัญญาณเสี่ยงพื้นฐานจากรายการที่ตรวจ";
  el.scanResult.replaceChildren(summary);

  if (findings.length) {
    const list = document.createElement("ul");
    for (const finding of findings) {
      const item = document.createElement("li");
      item.textContent = finding;
      list.append(item);
    }
    el.scanResult.append(list);
  }

  el.scanResult.classList.toggle("has-findings", findings.length > 0);
  el.scanResult.hidden = false;
}

async function scanCurrentPage() {
  if (scanBusy) return;
  scanBusy = true;
  el.scanBtn.disabled = true;
  el.scanResult.textContent = "กำลังตรวจสอบหน้านี้...";
  el.scanResult.classList.remove("has-findings");
  el.scanResult.hidden = false;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("ไม่พบแท็บที่กำลังเปิดอยู่");
    const result = await requestPageScan(tab.id);
    renderScanResult(result);
  } catch (error) {
    el.scanResult.textContent = error.message;
  } finally {
    scanBusy = false;
    el.scanBtn.disabled = false;
  }
}

function render() {
  const enabled = state.enabled !== false;
  const sites = Array.isArray(state.disabledSites) ? state.disabledSites : [];

  el.toggle.checked = enabled;
  el.hero.classList.toggle("disabled", !enabled);
  el.title.textContent = enabled ? "ระบบกำลังป้องกัน" : "ระบบปิดการป้องกัน";
  el.description.textContent = enabled
    ? "การป้องกันกำลังทำงานอยู่"
    : "ระบบบล็อกส่วนกลางถูกปิดอยู่";
  el.protection.textContent = enabled ? "ACTIVE" : "OFF";
  el.protection.style.color = enabled ? "#86EFAC" : "#FCA5A5";
  el.siteCount.textContent = String(sites.length);
  el.list.replaceChildren();

  if (!sites.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "◎";
    const title = document.createElement("strong");
    title.textContent = "ยังไม่มีเว็บไซต์ที่ยกเว้น";
    const desc = document.createElement("span");
    desc.textContent = "เว็บไซต์ที่เพิ่มจะแสดงตรงนี้";
    empty.append(icon, title, desc);
    el.list.append(empty);
    return;
  }

  for (const host of sites) {
    const item = document.createElement("div");
    item.className = "site-item";

    const globe = document.createElement("div");
    globe.className = "site-globe";
    globe.textContent = "◎";

    const info = document.createElement("div");
    info.className = "site-info";
    const name = document.createElement("strong");
    name.textContent = host;
    const subtitle = document.createElement("span");
    subtitle.textContent = "ยกเว้นการป้องกัน";
    info.append(name, subtitle);

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.type = "button";
    remove.textContent = "✕";
    remove.title = `ลบ ${host}`;
    remove.setAttribute("aria-label", `ลบ ${host}`);
    remove.addEventListener("click", () => removeSite(host));

    item.append(globe, info, remove);
    el.list.append(item);
  }
}

async function loadState() {
  try {
    state = await sendMessage({ type: "GET_STATE" });
    render();
  } catch (error) {
    showToast(error.message);
    el.title.textContent = "เชื่อมต่อระบบไม่ได้";
    el.description.textContent = "ตรวจสอบ background.js แล้วลอง Reload Extension";
  }
}

async function addSite(event) {
  event.preventDefault();
  if (busy) return;

  const host = normalizeHost(el.input.value);
  if (!host) {
    showToast("กรุณากรอกโดเมนให้ถูกต้อง เช่น example.com");
    el.input.focus();
    return;
  }
  if (state.disabledSites.includes(host)) {
    showToast("เว็บไซต์นี้อยู่ในรายการแล้ว");
    return;
  }

  busy = true;
  el.addBtn.disabled = true;
  try {
    state = await sendMessage({ type: "SET_SITE_DISABLED", host, disabled: true });
    el.input.value = "";
    render();
    showToast("เพิ่มเว็บไซต์ยกเว้นแล้ว");
  } catch (error) {
    showToast(error.message);
  } finally {
    busy = false;
    el.addBtn.disabled = false;
  }
}

async function removeSite(host) {
  if (busy) return;
  busy = true;
  try {
    state = await sendMessage({ type: "SET_SITE_DISABLED", host, disabled: false });
    render();
    showToast("ลบเว็บไซต์ออกแล้ว");
  } catch (error) {
    showToast(error.message);
  } finally {
    busy = false;
  }
}

async function resetSites() {
  if (busy) return;
  if (!state.disabledSites.length) {
    showToast("ไม่มีเว็บไซต์ที่ต้องล้าง");
    return;
  }
  if (!confirm("ต้องการล้างเว็บไซต์ที่ยกเว้นทั้งหมดหรือไม่?")) return;

  busy = true;
  el.reset.disabled = true;
  try {
    state = await sendMessage({ type: "RESET_SITES" });
    render();
    showToast("ล้างรายการเว็บไซต์ทั้งหมดแล้ว");
  } catch (error) {
    showToast(error.message);
  } finally {
    busy = false;
    el.reset.disabled = false;
  }
}

async function toggleProtection() {
  if (busy) {
    el.toggle.checked = state.enabled !== false;
    return;
  }

  const enabled = el.toggle.checked;
  busy = true;
  el.toggle.disabled = true;
  try {
    state = await sendMessage({ type: "SET_ENABLED", enabled });
    render();
    showToast(enabled ? "เปิดระบบป้องกันแล้ว" : "ปิดระบบป้องกันแล้ว");
  } catch (error) {
    el.toggle.checked = state.enabled !== false;
    showToast(error.message);
  } finally {
    busy = false;
    el.toggle.disabled = false;
  }
}

el.form.addEventListener("submit", addSite);
el.reset.addEventListener("click", resetSites);
el.toggle.addEventListener("change", toggleProtection);
el.scanBtn.addEventListener("click", scanCurrentPage);

loadState();
