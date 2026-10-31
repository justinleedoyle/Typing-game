import { SERIF } from "../palette";

export interface RecoveryDialogAction {
  label: string;
  shortcut?: string;
  onSelect: () => void;
}
export interface RecoveryDialog {
  destroy(): void;
  setMessage(message: string): void;
  setBusy(busy: boolean): void;
}

/** Asset-independent recovery controls remain available even if a scene cannot
 * create its canvas UI. Capture keyboard input before Phaser can act on it. */
export function showRecoveryDialog(options: {
  title: string;
  message: string;
  detail?: string;
  content?: HTMLElement;
  actions: RecoveryDialogAction[];
}): RecoveryDialog {
  const previousFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.dataset.recoveryDialog = "";
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "10000", display: "flex",
    alignItems: "center", justifyContent: "center", padding: "clamp(12px, 3vw, 48px)",
    boxSizing: "border-box", background: "rgba(8, 11, 18, 0.95)",
    color: "#f3ead2", fontFamily: SERIF,
  });
  const panel = document.createElement("section");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", options.title);
  Object.assign(panel.style, {
    width: "min(920px, 100%)", maxHeight: "100%", overflowY: "auto",
    boxSizing: "border-box", padding: "clamp(22px, 4vw, 54px)",
    border: "2px solid #c9a14a", borderRadius: "12px", background: "#1a1610",
    boxShadow: "0 18px 80px rgba(0,0,0,.45)", textAlign: "center",
  });
  const heading = document.createElement("h1");
  heading.textContent = options.title;
  Object.assign(heading.style, { margin: "0 0 24px", fontSize: "clamp(26px, 3vw, 42px)", fontWeight: "normal", lineHeight: "1.2" });
  const message = document.createElement("p");
  message.textContent = options.message;
  message.setAttribute("role", "status");
  Object.assign(message.style, { fontSize: "clamp(19px, 2vw, 25px)", lineHeight: "1.5", whiteSpace: "pre-line", margin: "0 0 28px" });
  panel.append(heading, message);
  if (options.detail) {
    const detail = document.createElement("p");
    detail.textContent = options.detail;
    Object.assign(detail.style, { fontSize: "18px", lineHeight: "1.5", color: "#cbbf9f", whiteSpace: "pre-line", margin: "0 0 28px" });
    panel.append(detail);
  }
  if (options.content) panel.append(options.content);
  const controls = document.createElement("div");
  Object.assign(controls.style, { display: "flex", flexDirection: "column", gap: "14px", alignItems: "stretch", maxWidth: "560px", margin: "0 auto" });
  let destroyed = false;
  let busy = false;
  const buttons = options.actions.map((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    if (action.shortcut) button.setAttribute("aria-keyshortcuts", action.shortcut);
    Object.assign(button.style, {
      font: "inherit", fontSize: "clamp(19px, 2vw, 24px)", color: "#f3ead2",
      background: "#292216", border: "1px solid #9e7f3c", borderRadius: "6px",
      padding: "14px 22px", cursor: "pointer", lineHeight: "1.3",
    });
    button.addEventListener("focus", () => { button.style.outline = "3px solid #e6c574"; button.style.outlineOffset = "3px"; });
    button.addEventListener("blur", () => { button.style.outline = "none"; });
    button.addEventListener("click", () => { if (!destroyed && !busy) action.onSelect(); });
    controls.append(button);
    return button;
  });
  panel.append(controls);
  const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const linkAttributes = links.map(link => ({ link, tabIndex: link.getAttribute("tabindex"), disabled: link.getAttribute("aria-disabled") }));
  panel.addEventListener("click", event => {
    if (busy && links.some(link => link === event.target || link.contains(event.target as Node))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  overlay.append(panel);
  document.body.append(overlay);
  const isTop = () => {
    const dialogs = document.querySelectorAll("[data-recovery-dialog]");
    return dialogs.item(dialogs.length - 1) === overlay;
  };
  const onKey = (event: KeyboardEvent) => {
    if (destroyed || !isTop() || event.ctrlKey || event.metaKey || event.altKey) return;
    // Even unrelated characters must not reach a canvas scene under this modal.
    event.stopImmediatePropagation();
    if (event.key === "Tab") {
      event.preventDefault();
      if (busy) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("a[href], button"))
        .filter(control => control.tabIndex >= 0 && control.getAttribute("aria-disabled") !== "true" && !(control as HTMLButtonElement).disabled);
      const index = focusable.indexOf(document.activeElement as HTMLButtonElement | HTMLAnchorElement);
      const next = index < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : (index + (event.shiftKey ? focusable.length - 1 : 1)) % focusable.length;
      focusable[next]?.focus();
      return;
    }
    if (event.repeat || busy) { event.preventDefault(); return; }
    const index = options.actions.findIndex(action => action.shortcut?.toLowerCase() === event.key.toLowerCase());
    if (index >= 0) {
      event.preventDefault();
      options.actions[index].onSelect();
    } else if (event.key !== "Enter" && event.key !== " ") {
      event.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey, true);
  buttons[0]?.focus();
  return {
    destroy() {
      if (destroyed) return;
      const restoreFocus = isTop();
      destroyed = true;
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    },
    setMessage(text) { if (!destroyed) message.textContent = text; },
    setBusy(value) {
      if (destroyed) return;
      busy = value;
      panel.setAttribute("aria-busy", String(value));
      buttons.forEach(button => { button.disabled = value; button.style.opacity = value ? "0.5" : "1"; });
      linkAttributes.forEach(({ link, tabIndex, disabled }) => {
        if (value) { link.setAttribute("aria-disabled", "true"); link.setAttribute("tabindex", "-1"); }
        else {
          if (disabled === null) link.removeAttribute("aria-disabled"); else link.setAttribute("aria-disabled", disabled);
          if (tabIndex === null) link.removeAttribute("tabindex"); else link.setAttribute("tabindex", tabIndex);
        }
      });
      if (!value && isTop()) buttons[0]?.focus();
    },
  };
}
