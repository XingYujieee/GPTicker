import {
  findPromptForm,
  findPromptTextarea,
  findSendButton
} from "./selectors";
import type { PromptActionResult } from "../shared/types";

interface InjectToChatOptions {
  autoSend?: boolean;
}

export async function injectToChat(
  text: string,
  options: InjectToChatOptions = {}
): Promise<PromptActionResult> {
  const promptInput = findPromptTextarea();

  if (!promptInput) {
    return {
      ok: false,
      action: "filled",
      reason: "prompt-input-not-found"
    };
  }

  promptInput.focus();
  setPromptValue(promptInput, text);
  dispatchPromptInputEvent(promptInput, text);

  if (!options.autoSend) {
    return {
      ok: true,
      action: "filled"
    };
  }

  const sendButton = await waitForSendButton(findPromptForm() ?? document);

  if (!sendButton) {
    return {
      ok: false,
      action: "filled",
      reason: "send-button-not-found"
    };
  }

  if (sendButton.disabled) {
    return {
      ok: false,
      action: "filled",
      reason: "send-button-disabled"
    };
  }

  sendButton.click();

  return {
    ok: true,
    action: "sent"
  };
}

export async function copyPromptText(
  text: string
): Promise<PromptActionResult> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);

      return {
        ok: true,
        action: "copied"
      };
    } catch {}
  }

  const success = copyPromptTextLegacy(text);

  return success
    ? {
        ok: true,
        action: "copied"
      }
    : {
        ok: false,
        action: "copied",
        reason: "clipboard-unavailable"
      };
}

function setPromptValue(element: HTMLElement, value: string) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    setNativeTextControlValue(element, value);
    element.setSelectionRange(value.length, value.length);
    return;
  }

  if (element.isContentEditable) {
    setContentEditableValue(element, value);
    placeCursorAtEnd(element);
    return;
  }

  element.textContent = value;
}

function setNativeTextControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }

  element.value = value;
}

function setContentEditableValue(element: HTMLElement, value: string) {
  const fragment = document.createDocumentFragment();
  const lines = value.split("\n");

  if (lines.length === 0) {
    lines.push("");
  }

  for (const line of lines) {
    const paragraph = document.createElement("p");

    if (line.length > 0) {
      paragraph.textContent = line;
    } else {
      paragraph.append(document.createElement("br"));
    }

    fragment.append(paragraph);
  }

  element.replaceChildren(fragment);
}

function dispatchPromptInputEvent(element: HTMLElement, value: string) {
  try {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: value
      })
    );
  } catch {
    element.dispatchEvent(
      new Event("input", {
        bubbles: true,
        cancelable: true
      })
    );
  }

  element.dispatchEvent(
    new Event("change", {
      bubbles: true
    })
  );
}

function placeCursorAtEnd(element: HTMLElement) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function waitForSendButton(root: ParentNode) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const button = findSendButton(root);

    if (button && !button.disabled) {
      return button;
    }

    await nextFrame();
  }

  return findSendButton(root);
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function copyPromptTextLegacy(text: string) {
  const buffer = document.createElement("textarea");
  buffer.value = text;
  buffer.setAttribute("readonly", "true");
  buffer.style.cssText =
    "position: fixed; top: -9999px; left: -9999px; opacity: 0; pointer-events: none;";

  (document.body ?? document.documentElement).append(buffer);
  buffer.select();
  buffer.setSelectionRange(0, text.length);

  const success = document.execCommand("copy");
  buffer.remove();

  return success;
}
