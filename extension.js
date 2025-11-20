import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { setLogging, setLogFn, journal } from './utils.js'

const DateMenu = Main.panel.statusArea.dateMenu;
let handId = null;

export default class NotificationThemeExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._themeSignalId = null;
  }

  enable() {
    // Main.notify('My Extension', 'This is a notification from my GNOME extension!');
    // global.notify_error("msg", "details");
    // Nothing to do; stylesheet.css handles everything

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
    // Have to enable disable as this needs to be the last
    // The following code needs to be run after the menu is populated
    // See what's currently in each box
    journal('=== LEFT BOX ===');
    Main.panel._leftBox.get_children().forEach((child, index) => {
      let role = null;
      for (const r in Main.panel.statusArea) {
        if (Main.panel.statusArea[r].container === child) {
          role = r;
          break;
        }
      }
      journal(`[${index}]: ${role || 'unknown'}`);
    });

    journal('=== CENTER BOX ===');
    Main.panel._centerBox.get_children().forEach((child, index) => {
      let role = null;
      for (const r in Main.panel.statusArea) {
        if (Main.panel.statusArea[r].container === child) {
          role = r;
          break;
        }
      }
      journal(`[${index}]: ${role || 'unknown'}`);
    });

    journal('=== RIGHT BOX ===');
    Main.panel._rightBox.get_children().forEach((child, index) => {
      let role = null;
      for (const r in Main.panel.statusArea) {
        if (Main.panel.statusArea[r].container === child) {
          role = r;
          break;
        }
      }
      journal(`[${index}]: ${role || 'unknown'}`);
    });

    DateMenu._calendar._weekStart = 6; // Saturday

    DateMenu._calendar._onSettingsChange();

    const messageTrayContainer = Main.messageTray.get_first_child();

    this._themeSignalId = messageTrayContainer?.connect("child-added", () => {
      const notificationContainer = messageTrayContainer?.get_first_child();
      const notification = notificationContainer?.get_first_child();

      const header = notification?.get_child_at_index(0);
      const headerContent = header?.get_child_at_index(1);
      const headerContentSource = headerContent?.get_child_at_index(0);
      const headerContentTime = headerContent?.get_child_at_index(1);

      const content = notification?.get_child_at_index(1);
      const contentContent = content?.get_child_at_index(1);
      const contentContentTitle = contentContent?.get_child_at_index(0);
      const contentContentBody = contentContent?.get_child_at_index(1).get_first_child();

      headerContentTime.destroy();

      // const bgColor = notificationContainer.get_theme_node().get_background_color();
      // const bgColorHex = this.coglColorToHex(bgColor);

      // headerContentTime.set_style(`color: ${bgColorHex};`);
      // // headerContentSource.set_style('color: #00ff00;');
      // // contentContentTitle.set_style('color: #ffff00;');
      // // contentContentBody.set_style('color: #0000ff;');
      // // notificationContainer.set_style('background-color: #6a0dad; border-radius: 12px;');
    });
  }

  // coglColorToHex(coglColor) {
  //   const { red, green, blue } = coglColor;

  //   const toHex = n => n.toString(16).padStart(2, '0');
  //   return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  // }

  disable() {
    if (this._themeSignalId) {
      const messageTrayContainer = Main.messageTray.get_first_child();
      messageTrayContainer?.disconnect(this._themeSignalId);
      this._themeSignalId = null;
    }

    DateMenu._calendar._weekStart = Shell.util_get_week_start();
    DateMenu._calendar._onSettingsChange();
    if (handId) {
      this._settings.disconnect(handId);
      handId = null;
    }
  }
}
