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

    this._origPanelLayout = null;
    this._origFindDraggable = null;
    this._stockAttentionHandler = null;
    this.scrollEventId = null;
    this._lastWrapTime = 0;

    // Move panel to bottom
    this._movePanelPosition(true);

    // Rearrange indicators first, then hide Activities, because
    // _updatePanel() re-shows the containers.
    this._moveIndicators(true);
    this._toggleActivities(true);

    // Stop the panel from starting a window-move grab on press.
    this._disablePanelWindowDrag(true);

    // Replace "is ready" notifications with direct window activation.
    this._replaceWindowAttentionHandler(true);

    // Scroll on panel to change workspace (wraps around at the ends)
    this.scrollEventId = Main.panel.connect('scroll-event',
      (_actor, event) => this._handleScroll(event));

    GLib.idle_add(GLib.PRIORITY_HIGH, () => {
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
  // ---------------------------------------------------------------------
  _moveIndicators(active) {
    const modePanel = Main.sessionMode.panel;

    if (active) {
      // Save exact copies so disable() can restore without duplicates.
      this._origPanelLayout = {
        left: [...modePanel.left],
        center: [...modePanel.center],
        right: [...modePanel.right],
      };

      modePanel.left = modePanel.left.filter(i => i !== 'activities');
      modePanel.center = modePanel.center.filter(i => i !== 'dateMenu');
      modePanel.right = [
        'dateMenu',
        ...modePanel.right.filter(i => i !== 'activities' && i !== 'dateMenu'),
        'activities',
      ];
    } else if (this._origPanelLayout) {
      modePanel.left = [...this._origPanelLayout.left];
      modePanel.center = [...this._origPanelLayout.center];
      modePanel.right = [...this._origPanelLayout.right];
      this._origPanelLayout = null;
    }

    Main.panel._updatePanel();
  }

  _toggleActivities(active) {
    const activities = Main.panel.statusArea['activities'];
    if (!activities) return;
    if (active) activities.hide();
    else activities.show();
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
    // Move panel back to top
    this._movePanelPosition(false);

    // Restore the stock panel layout, then show Activities again.
    this._moveIndicators(false);
    this._toggleActivities(false);

    this._disablePanelWindowDrag(false);

    if (this.scrollEventId != null) {
      Main.panel.disconnect(this.scrollEventId);
      this.scrollEventId = null;
    }

    this._replaceWindowAttentionHandler(false);
  }
}