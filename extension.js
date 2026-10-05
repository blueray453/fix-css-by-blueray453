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
    this._handlerid = null;
    this.scrollEventId = null;

    // Move panel to bottom
    this._movePanelPosition(true);

    // Rearrange indicators first, then hide Activities, because
    // _updatePanel() re-shows the containers.
    this._moveIndicators(true);
    this._toggleActivities(true);

    // Stop the panel from starting a window-move grab on press.
    this._disablePanelWindowDrag(true);

    this._disableWindowDemandAttention(true);

    // Scroll on panel to change workspace
    this.scrollEventId = Main.panel.connect('scroll-event',
      (_actor, event) => Main.wm.handleWorkspaceScroll(event));

    GLib.idle_add(GLib.PRIORITY_HIGH, () => {
      Main.overview.hide();
      return GLib.SOURCE_REMOVE;
    });
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
  // Window demands attention -> just activate it
  // ---------------------------------------------------------------------
  _disableWindowDemandAttention(active) {
    if (active) {
      this._handlerid = global.display.connect('window-demands-attention',
        (_display, window) => {
          Main.activateWindow(window);
        });
    } else if (this._handlerid) {
      global.display.disconnect(this._handlerid);
      this._handlerid = null;
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

    this._disableWindowDemandAttention(false);
  }
}