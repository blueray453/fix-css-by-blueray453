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

    // Main.overview.dash.height = 0;
    // Main.overview.dash.hide();

    // journalctl -f -o cat SYSLOG_IDENTIFIER=fix-css-by-blueray453
    journal(`Enabled`);

    // // Move panel to bottom
    this._movePanelPosition(true);

    // this._toggleActivities(true);

    this._moveActivities(true);

    this._moveDate(true);

    this._disableWindowDemandAttention(true);

    // Scroll on panel to change workspace
    this.scrollEventId = Main.panel.connect('scroll-event', (_actor, event) => Main.wm.handleWorkspaceScroll(event));
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

  _disableWindowDemandAttention(active) {
    if (active) {
      this._handlerid = global.display.connect('window-demands-attention', function (display, window) {
        Main.activateWindow(window);
      });
    }
    else {
      global.display.disconnect(this._handlerid);
      this._handlerid = null;
    }
  }

  _movePanelPosition(active) {
    if (active) {
      Main.layoutManager.panelBox.set_position(0, global.get_screen_height() - Main.panel.height);
    } else {
      Main.layoutManager.panelBox.set_position(0, 0);
    }
  }

  _getRolesInBox(box, boxName = '', log = true) {
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

    // // this._toggleActivities(false);

    if (this.scrollEventId != null) {
      Main.panel.disconnect(this.scrollEventId);
      this.scrollEventId = null;
    }

    this._moveActivities(false);

    this._moveDate(false);

    this._disableWindowDemandAttention(false);

    // this._getRolesInBox(Panel._leftBox, 'LEFT BOX');
    // this._getRolesInBox(Panel._centerBox, 'CENTER BOX');
    // this._getRolesInBox(Panel._rightBox, 'RIGHT BOX');
  }
}
