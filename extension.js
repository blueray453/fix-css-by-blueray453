import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
    this._idleId = 0;

    // Replace "is ready" notifications with direct window activation.
    this._replaceWindowAttentionHandler(true);

    this._idleId = GLib.idle_add(GLib.PRIORITY_HIGH, () => {
      this._idleId = 0;
      Main.overview.hide();
      return GLib.SOURCE_REMOVE;
    });
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

  disable() {
    if (this._idleId) {
      GLib.Source.remove(this._idleId);
      this._idleId = 0;
    }

    this._replaceWindowAttentionHandler(false);
  }
}