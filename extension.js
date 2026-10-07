import Clutter from 'gi://Clutter';
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

    this._modePanel = null;
    this._origPanelLayout = null;
    this._origFindDraggable = null;
    this._stockAttentionHandler = null;
    this._idleId = 0;
    this._lastWrapTime = 0;

    // Move panel to bottom
    this._movePanelPosition(true);

    // Rearrange indicators (Activities is removed from the layout entirely;
    // _updatePanel() keeps indicators that are not listed hidden).
    this._moveIndicators(true);

    // Stop the panel from starting a window-move grab on press.
    this._disablePanelWindowDrag(true);

    // Replace "is ready" notifications with direct window activation.
    this._replaceWindowAttentionHandler(true);

    // Scroll on panel to change workspace (wraps around at the ends)
    Main.panel.connectObject('scroll-event',
      (_actor, event) => this._handleScroll(event), this);

    this._idleId = GLib.idle_add(GLib.PRIORITY_HIGH, () => {
      this._idleId = 0;
      Main.overview.hide();
      return GLib.SOURCE_REMOVE;
    });
  }

  // ---------------------------------------------------------------------
  // Workspace scroll: stock behaviour, with wrap-around at the ends
  // ---------------------------------------------------------------------
  _handleScroll(event) {
    const wm = Main.wm;
    const workspaceManager = global.workspace_manager;

    if (event.type() !== Clutter.EventType.SCROLL)
      return wm.handleWorkspaceScroll(event);

    let step;
    switch (event.get_scroll_direction()) {
      case Clutter.ScrollDirection.UP:
      case Clutter.ScrollDirection.LEFT:
        step = -1;
        break;
      case Clutter.ScrollDirection.DOWN:
      case Clutter.ScrollDirection.RIGHT:
        step = 1;
        break;
      default:
        return wm.handleWorkspaceScroll(event);
    }

    const n = workspaceManager.get_n_workspaces();
    const idx = workspaceManager.get_active_workspace_index();
    const now = GLib.get_monotonic_time() / 1000; // ms

    const atEdge = n > 1 &&
      ((step > 0 && idx === n - 1) || (step < 0 && idx === 0));

    // Normal case: let GNOME handle it, unless we just wrapped.
    if (!atEdge) {
      if (now - this._lastWrapTime < 150)
        return Clutter.EVENT_STOP;
      return wm.handleWorkspaceScroll(event);
    }

    // Edge case: skip if stock just moved us here or we just wrapped,
    // so one flick doesn't chain moves together.
    if (!wm._canScroll || now - this._lastWrapTime < 150)
      return Clutter.EVENT_STOP;

    this._lastWrapTime = now;
    const target = step > 0 ? 0 : n - 1;   // last -> first, first -> last
    wm.actionMoveWorkspace(workspaceManager.get_workspace_by_index(target));

    return Clutter.EVENT_STOP;
  }

  // ---------------------------------------------------------------------
  // Panel position
  // ---------------------------------------------------------------------
  _placePanel() {
    const { panelBox, primaryMonitor: m } = Main.layoutManager;
    if (!m) return;
    panelBox.set_position(m.x, m.y + m.height - panelBox.height);
  }

  _movePanelPosition(active) {
    const lm = Main.layoutManager;
    if (active) {
      this._placePanel();
      // LayoutManager resets panelBox to the top on monitor changes, so
      // reapply our position whenever that happens or the height changes.
      lm.connectObject('monitors-changed', () => this._placePanel(), this);
      lm.panelBox.connectObject('notify::height', () => this._placePanel(), this);
    } else {
      lm.disconnectObject(this);
      lm.panelBox.disconnectObject(this);
      const m = lm.primaryMonitor;
      if (m) lm.panelBox.set_position(m.x, m.y);
    }
  }

  // ---------------------------------------------------------------------
  // Activities / date placement
  //
  // Panel._updatePanel() hides every indicator container and then shows
  // only those listed in the session mode layout, so removing 'activities'
  // from the layout is enough to keep it hidden. Restoring the layout
  // brings it back.
  // ---------------------------------------------------------------------
  _moveIndicators(active) {
    if (active) {
      if (this._modePanel) return;

      // Keep a reference to the exact object we modify, so disable() restores
      // it even if the session mode has changed in the meantime.
      const panel = Main.sessionMode.panel;
      this._modePanel = panel;
      this._origPanelLayout = {
        left: [...panel.left],
        center: [...panel.center],
        right: [...panel.right],
      };

      const drop = new Set(['activities', 'dateMenu']);
      panel.left = panel.left.filter(i => !drop.has(i));
      panel.center = panel.center.filter(i => !drop.has(i));
      panel.right = ['dateMenu', ...panel.right.filter(i => !drop.has(i))];
    } else if (this._modePanel) {
      Object.assign(this._modePanel, this._origPanelLayout);
      this._modePanel = null;
      this._origPanelLayout = null;
    }

    Main.panel._updatePanel();
  }

  // ---------------------------------------------------------------------
  // Disable the panel's "drag maximized window" behaviour.
  //
  // The panel's click gesture (recognize_on_press) calls
  // _getDraggableWindowForPosition() when pressed and returns early if it
  // finds no window. Returning null means no move grab is ever started.
  // ---------------------------------------------------------------------
  _disablePanelWindowDrag(active) {
    const panel = Main.panel;
    if (active) {
      if (this._origFindDraggable) return;
      this._origFindDraggable = panel._getDraggableWindowForPosition;
      panel._getDraggableWindowForPosition = () => null;
    } else if (this._origFindDraggable) {
      panel._getDraggableWindowForPosition = this._origFindDraggable;
      this._origFindDraggable = null;
    }
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

    Main.panel.disconnectObject(this);

    // Move panel back to top
    this._movePanelPosition(false);

    // Restore the stock panel layout; _updatePanel() shows Activities again.
    this._moveIndicators(false);

    this._disablePanelWindowDrag(false);

    this._replaceWindowAttentionHandler(false);
  }
}