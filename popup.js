
"use strict";

const $ = id => document.getElementById(id);

const elements = {
  hero: $("hero"),
  title: $("statusTitle"),
  description: $("statusDescription"),
  toggle: $("masterToggle"),
  siteCount: $("siteCount"),
  protection: $("protectionStatus"),
  input: $("siteInput"),
  form: $("siteForm"),
  addBtn: $("addBtn"),
  list: $("siteList"),
  reset: $("resetBtn"),
  toast: $("toast")
};

let currentState = {
  enabled: true,
  disabledSites: []
};

let busy = false;
let toastTimer;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2200);
}

function normalizeHost(value) {
  const input = value.trim().replace(/^\*\./, "");

  if (!input) return null;

  try {
    const url = new URL(
      input.includes("://") ? input : `https://${input}`
    );

    if (!["http:", "https:"].includes(url.protocol)) return null;

    const host = url.hostname.toLowerCase().replace(/\.$/, "");

    if (
      !host ||
      !host.includes(".") ||
      host.includes("*") ||
      host.length > 253
    ) {
      return null;
    }

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

function render() {
  const enabled = currentState.enabled;
  const sites = currentState.disabledSites || [];

  elements.toggle.checked = enabled;
  elements.hero.classList.toggle("disabled", !enabled);

  elements.title.textContent = enabled
    ? "ระบบกำลังป้องกัน"
    : "ระบบปิดการป้องกัน";

  elements.description.textContent = enabled
    ? "การป้องกันกำลังทำงานอยู่"
    : "โฆษณาอาจปรากฏบนเว็บไซต์";

  elements.protection.textContent = enabled ? "ACTIVE" : "OFF";
  elements.protection.style.color = enabled ? "#86EFAC" : "#FCA5A5";

  elements.siteCount.textContent = String(sites.length);

  elements.list.replaceChildren();

  if (!sites.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "◎";

    const title = document.createElement("strong");
    title.textContent = "ยังไม่มีเว็บไซต์ที่ยกเว้น";

    const description = document.createElement("span");
    description.textContent = "เว็บไซต์ที่เพิ่มจะแสดงตรงนี้";

    empty.append(icon, title, description);
    elements.list.append(empty);
    return;
  }

  sites.forEach(host => {
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
    remove.title = "ลบเว็บไซต์นี้";
    remove.setAttribute("aria-label", `ลบ ${host}`);

    remove.addEventListener("click", () => removeSite(host));

    item.append(globe, info, remove);
    elements.list.append(item);
  });
}

async function loadState() {
  try {
    currentState = await sendMessage({
      type: "GET_STATE"
    });

    render();
  } catch (error) {
    showToast(error.message);
  }
}

async function addSite(event) {
  event.preventDefault();

  if (busy) return;

  const host = normalizeHost(elements.input.value);

  if (!host) {
    showToast("กรุณากรอกชื่อเว็บไซต์ให้ถูกต้อง");
    return;
  }

  if (currentState.disabledSites.includes(host)) {
    showToast("เว็บไซต์นี้อยู่ในรายการแล้ว");
    return;
  }

  busy = true;
  elements.addBtn.disabled = true;

  try {
    currentState = await sendMessage({
      type: "SET_SITE_DISABLED",
      host,
      disabled: true
    });

    elements.input.value = "";
    render();
    showToast("เพิ่มเว็บไซต์เรียบร้อยแล้ว");
  } catch (error) {
    showToast(error.message);
  } finally {
    busy = false;
    elements.addBtn.disabled = false;
  }
}

async function removeSite(host) {
  if (busy) return;

  busy = true;

  try {
    currentState = await sendMessage({
      type: "SET_SITE_DISABLED",
      host,
      disabled: false
    });

    render();
    showToast("ลบเว็บไซต์เรียบร้อยแล้ว");
  } catch (error) {
    showToast(error.message);
  } finally {
    busy = false;
  }
}

async function resetSites() {
  if (busy || !currentState.disabledSites.length) {
    showToast("ไม่มีเว็บไซต์ที่ต้องล้าง");
    return;
  }

  if (!confirm("ต้องการล้างรายการเว็บไซต์ที่ยกเว้นทั้งหมดหรือไม่?")) {
    return;
  }

  busy = true;
  elements.reset.disabled = true;

  try {
    currentState = await sendMessage({
      type: "RESET_SITES"
    });

    render();
    showToast("ล้างรายการเว็บไซต์ทั้งหมดแล้ว");
  } catch (error) {
    showToast(error.message);
  } finally {
    busy = false;
    elements.reset.disabled = false;
  }
}

async function toggleProtection() {
  if (busy) return;

  const enabled = elements.toggle.checked;
  busy = true;

  try {
    currentState = await sendMessage({
      type: "SET_ENABLED",
      enabled
    });

    render();
    showToast(enabled
      ? "เปิดระบบป้องกันแล้ว"
      : "ปิดระบบป้องกันแล้ว"
    );
  } catch (error) {
    elements.toggle.checked = currentState.enabled;
    showToast(error.message);
  } finally {
    busy = false;
  }
}

elements.form.addEventListener("submit", addSite);
elements.reset.addEventListener("click", resetSites);
elements.toggle.addEventListener("change", toggleProtection);

loadState();
