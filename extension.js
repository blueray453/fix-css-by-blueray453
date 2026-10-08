import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
  initLogging,
  createLogger,
} from './logger.js';

const journal = createLogger(import.meta.url);

const SWITCHER_TIMEOUT = 600; // same as DISPLAY_TIMEOUT in the stock popup

export default class NotificationThemeExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal(`Enabled`);

    this._stockAttentionHandler = null;
    this._switcherStub = null;

    // Replace "is ready" notifications with direct window activation.
    this._replaceWindowAttentionHandler(true);

    // Never show the workspace switcher popup.
    this._disableWorkspaceSwitcherPopup(true);
  }

  disable() {
    this._replaceWindowAttentionHandler(false);
    this._disableWorkspaceSwitcherPopup(false);
  }

  // ---------------------------------------------------------------------
  // Window demands attention / marked urgent -> just activate it
  //
  // The stock WindowAttentionHandler connects to both signals using itself
  // as the owner (connectObject), so disconnectObject(handler) removes both
  // of its handlers and no "<window> is ready" notification is ever created.
  // ---------------------------------------------------------------------
  _replaceWindowAttentionHandler(active) {
    const display = global.display;

    if (active) {
      if (this._stockAttentionHandler) return;

      this._stockAttentionHandler = Main.windowAttentionHandler;
      if (this._stockAttentionHandler)
        display.disconnectObject(this._stockAttentionHandler);

      const activate = (_display, window) => {
        // Same guard as stock: ignore focused and skip-taskbar windows
        // (e.g. GIMP toolbars set urgency while GIMP itself is focused).
        if (!window || window.has_focus() || window.is_skip_taskbar())
          return;
        Main.activateWindow(window);
      };

      display.connectObject(
        'window-demands-attention', activate,
        'window-marked-urgent', activate,
        this);
    } else {
      display.disconnectObject(this);

      // Restore the stock notification behaviour.
      const h = this._stockAttentionHandler;
      this._stockAttentionHandler = null;

      if (h && typeof h._onWindowDemandsAttention === 'function') {
        display.connectObject(
          'window-demands-attention', h._onWindowDemandsAttention.bind(h),
          'window-marked-urgent', h._onWindowDemandsAttention.bind(h),
          h);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Disable the workspace switcher popup
  //
  // WindowManager._showWorkspaceSwitcher() only creates a real popup when
  // Main.wm._workspaceSwitcherPopup is null; otherwise it just calls
  // popup.display(). We put a stand-in object in that field so no popup is
  // ever constructed.
  //
  // Because the real popup's 'destroy' handler is never connected, the stub
  // does that handler's job itself: block workspace updates while "shown",
  // then after the stock timeout unblock them and reset _isWorkspacePrepended.
  // destroy() is also required because WindowManager._startSwitcher() calls
  // it when Alt+Tab is pressed.
  // ---------------------------------------------------------------------
  _disableWorkspaceSwitcherPopup(active) {
    const wm = Main.wm;

    if (active) {
      if (this._switcherStub) return;

      // Remove a real popup that may already be on screen. Its own destroy
      // handler unblocks updates and nulls wm._workspaceSwitcherPopup.
      wm._workspaceSwitcherPopup?.destroy();

      let timeoutId = 0;
      let blocked = false;

      // Mirrors the stock popup's destroy handler in _showWorkspaceSwitcher().
      const release = () => {
        if (timeoutId) {
          GLib.source_remove(timeoutId);
          timeoutId = 0;
        }
        if (blocked) {
          blocked = false;
          wm.unblockWorkspaceUpdates();
        }
        wm._isWorkspacePrepended = false;
      };

      const stub = {
        display() {
          if (!blocked) {
            blocked = true;
            wm.blockWorkspaceUpdates();
          }
          if (timeoutId)
            GLib.source_remove(timeoutId);
          timeoutId = GLib.timeout_add_once(
            GLib.PRIORITY_DEFAULT, SWITCHER_TIMEOUT, () => {
              timeoutId = 0;
              release();
            });
        },
        destroy: release,
      };

      this._switcherStub = stub;
      wm._workspaceSwitcherPopup = stub;
    } else {
      if (!this._switcherStub) return;

      // Releases the block, clears the timeout and resets the flag.
      this._switcherStub.destroy();
      if (wm._workspaceSwitcherPopup === this._switcherStub)
        wm._workspaceSwitcherPopup = null;
      this._switcherStub = null;
    }
  }
}