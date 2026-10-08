import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';

import {
  initLogging,
  createLogger,
} from './logger.js';

const journal = createLogger(import.meta.url);

export default class NotificationThemeExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal(`Enabled`);

    this._stockAttentionHandler = null;
    this._origSwitcherDisplay = null;

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
  // WindowManager._showWorkspaceSwitcher() creates the popup, connects a
  // 'destroy' handler (which unblocks workspace updates and clears its
  // reference), then calls popup.display(). Destroying the popup inside
  // display() lets that handler run, so nothing is left in a bad state.
  // The popup is hidden at construction and never mapped, so nothing is
  // ever drawn.
  // ---------------------------------------------------------------------
  _disableWorkspaceSwitcherPopup(active) {
    const proto = WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype;

    if (active) {
      if (this._origSwitcherDisplay) return;

      this._origSwitcherDisplay = proto.display;

      proto.display = function (_activeWorkspaceIndex) {
        this.destroy();
      };

      // Kill an instance that may already be on screen.
      Main.wm._workspaceSwitcherPopup?.destroy();
    } else {
      if (!this._origSwitcherDisplay) return;

      proto.display = this._origSwitcherDisplay;
      this._origSwitcherDisplay = null;
    }
  }
}