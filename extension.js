import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { setLogging, setLogFn, journal } from './utils.js'

const Panel = Main.panel;
const SessionModePanel = Main.sessionMode.panel;
const StatusArea = Panel.statusArea;

export default class NotificationThemeExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._themeSignalId = null;
  }

  enable() {
    setLogFn((msg, error = false) => {
      let level;
      if (error) {
        level = GLib.LogLevelFlags.LEVEL_CRITICAL;
      } else {
        level = GLib.LogLevelFlags.LEVEL_MESSAGE;
      }

      GLib.log_structured(
        'fix-css-by-blueray453',
        level,
        {
          MESSAGE: `${msg}`,
          SYSLOG_IDENTIFIER: 'fix-css-by-blueray453',
          CODE_FILE: GLib.filename_from_uri(import.meta.url)[0]
        }
      );
    });

    setLogging(true);

    // journalctl -f -o cat SYSLOG_IDENTIFIER=fix-css-by-blueray453
    journal(`Enabled`);

    // Main.panel._centerBox.connect('child-added', (box, child) => {
    //   // Move the child from center to right box
    //   box.remove_child(child);
    //   journal(`Child is: ${child}`)
    //   Main.panel._rightBox.add_child(child);
    // });

    // Hardcoded center box order
    const CENTER_ORDER = [
    ];

    const RIGHT_ORDER = [
      "ShowNetSpeedButton",
      "printers",
      "lockkeys@febueldo.test",
      "color-picker@tuberry",
      "clipboardIndicator",
      "athan@goodm4ven"
    ];

    let attempts = 0;

    let ALL_ORDER = [...CENTER_ORDER, ...RIGHT_ORDER];
    // Start polling every 100ms
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      attempts++;

      // Filter out roles that are already found
      ALL_ORDER = ALL_ORDER.filter(role => {
        const obj = StatusArea[role];
        // journal(`Checking role: ${role}`);

        // Keep only roles NOT found yet
        return !obj || !obj.container;
      });

      // journal(`ALL_ORDER ${ALL_ORDER}`);
      if (ALL_ORDER.length === 0) {
        journal(`Attempt ${attempts}`);
        // journal("All center and right roles found — panel ready!");

        // Run your organization logic now
        this.safelyReorder('center', CENTER_ORDER);
        this.safelyReorder('right', RIGHT_ORDER);

        return GLib.SOURCE_REMOVE; // stop polling
      }

      // Polling Limit
      if (attempts >= 40) {
        // journal("Stopped polling after 25 attempts — roles not fully found.");
        return GLib.SOURCE_REMOVE; // Stop regardless of success
      }

      return GLib.SOURCE_CONTINUE; // keep polling
    });

    // Move panel to bottom
    this._movePanelPosition(true);

    // this._toggleActivities(true);

    this._moveActivities(true);

    this._moveDate(true);

    // Scroll on panel to change workspace
    this.scrollEventId = Main.panel.connect('scroll-event', (_actor, event) => Main.wm.handleWorkspaceScroll(event));

    // No overview at start-up
    Main.layoutManager.connectObject('startup-complete', () => Main.overview.hide(), this);
  }

  safelyReorder(boxType, desiredOrder) {
    const panel = Main.panel;
    const box = panel[`_${boxType}Box`];

    if (!box) {
      log(`Box ${boxType} not found`);
      return;
    }

    // Walk the desired order and reposition existing indicators
    desiredOrder.forEach((role, index) => {
      const indicator = panel.statusArea[role];
      if (!indicator || !indicator.container)
        return; // Skip missing ones

      const actor = indicator.container;

      // Only reorder if the indicator is already inside this box
      // journal(`Actor Parent: ${actor.get_parent()}`);
      // journal(`Box: ${box}`);
      if (actor.get_parent() === box) {
        box.set_child_at_index(actor, index);
        // journal(`Set Child`);
      }
    });
    // journal(`=== ${boxType} box organization complete ===`);
  }

  _moveActivities(active) {
    if (active) {
      SessionModePanel.left = SessionModePanel.center.filter(item => item != 'activities')
      SessionModePanel.right.push('activities');
      // journal(`Left Array: ${SessionModePanel.left}`);
      // journal(`Right Array: ${SessionModePanel.right}`);
    } else {
      SessionModePanel.right = SessionModePanel.right.filter(item => item != 'activities')
      SessionModePanel.left.push('activities');
    }

    Main.panel._updatePanel();
  }

  _moveDate(active) {
    if (active) {
      SessionModePanel.center = SessionModePanel.center.filter(item => item != 'dateMenu')
      SessionModePanel.right.splice(0, 0, 'dateMenu');
    } else {
      SessionModePanel.right = SessionModePanel.right.filter(item => item != 'dateMenu')
      SessionModePanel.center.push('dateMenu');
    }

    Main.panel._updatePanel();
  }

  _toggleActivities(active) {
    const activities = Main.panel.statusArea["activities"];
    if (!activities) return;
    if (active) activities.hide();
    else activities.show();
  }

  _movePanelPosition(active) {
    if (active) {
      Main.layoutManager.panelBox.set_position(0, global.get_screen_height() - Main.panel.height);
    } else {
      Main.layoutManager.panelBox.set_position(0, 0);
    }
  }

  getRolesInBox(box, boxName = '', log = true) {
    const roles = [];

    box.get_children().forEach((child, index) => {
      let role = null;

      for (const r in StatusArea) {
        if (StatusArea[r].container === child) {
          role = r;
          break;
        }
      }

      const roleName = role || 'unknown';
      roles.push(roleName);

      if (log) {
        journal(`${boxName}[${index}]: ${roleName}`);
      }
    });

    return roles;
  }

  disable() {
    // Move panel back to top
    this._movePanelPosition(false);

    // this._toggleActivities(false);

    if (this.scrollEventId != null) {
      Main.panel.disconnect(this.scrollEventId);
      this.scrollEventId = null;
    }

    this._moveActivities(false);

    this._moveDate(false);

    // this.getRolesInBox(Panel._leftBox, 'LEFT BOX');
    // this.getRolesInBox(Panel._centerBox, 'CENTER BOX');
    // this.getRolesInBox(Panel._rightBox, 'RIGHT BOX');
  }
}
