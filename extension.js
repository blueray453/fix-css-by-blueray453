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
    // // Have to enable disable as this needs to be the last
    // // The following code needs to be run after the menu is populated
    // // See what's currently in each box
    // journal('=== LEFT BOX ===');
    // Main.panel._leftBox.get_children().forEach((child, index) => {
    //   let role = null;
    //   for (const r in Main.panel.statusArea) {
    //     if (Main.panel.statusArea[r].container === child) {
    //       role = r;
    //       break;
    //     }
    //   }
    //   journal(`[${index}]: ${role || 'unknown'}`);
    // });

    // journal('=== CENTER BOX ===');
    // Main.panel._centerBox.get_children().forEach((child, index) => {
    //   let role = null;
    //   for (const r in Main.panel.statusArea) {
    //     if (Main.panel.statusArea[r].container === child) {
    //       role = r;
    //       break;
    //     }
    //   }
    //   journal(`[${index}]: ${role || 'unknown'}`);
    // });

    // journal('=== RIGHT BOX ===');
    // Main.panel._rightBox.get_children().forEach((child, index) => {
    //   let role = null;
    //   for (const r in Main.panel.statusArea) {
    //     if (Main.panel.statusArea[r].container === child) {
    //       role = r;
    //       break;
    //     }
    //   }
    //   journal(`[${index}]: ${role || 'unknown'}`);
    // });

    // Hardcoded center box order
    const CENTER_ORDER = [
      "ShowNetSpeedButton",
      "workspace-indicator",
    ];

    const RIGHT_ORDER = [
      "currentworkspacename@jaybeeunix.dev",
      "printers",
      "lockkeys@febueldo.test",
      "color-picker@tuberry", // Fixed: removed space
      "clipboardIndicator",
      "dwellClick",
      "screenRecording",
      "screenSharing",
      "a11y",
      "keyboard",
      "athan@goodm4ven",
    ];

    // Organize both boxes
    this.organizePanelItems('center', CENTER_ORDER);
    this.organizePanelItems('right', RIGHT_ORDER);

    // Main.panel._centerBox.connect('child-added', (actor, child) => {
    //   // Find the role for this child, same as your for-loop logic
    //   let role = null;

    //   for (const r in Main.panel.statusArea) {
    //     if (Main.panel.statusArea[r].container === child) {
    //       role = r;
    //       break;
    //     }
    //   }

    //   journal('=== NEW CHILD ADDED TO CENTER BOX ===');
    //   journal(`child: ${child}`);
    //   journal(`role: ${role || 'unknown'}`);
    // });

    // // Stamp the panel role onto each container
    // for (const role in Main.panel.statusArea) {
    //   const obj = Main.panel.statusArea[role];

    //   // Only stamp if container exists
    //   if (obj && obj.container) {
    //     obj.container._panelRole = role;
    //   }
    // }

    // // Now you can use child-added easily
    // this._centerAddedId = Main.panel._centerBox.connect(
    //   'child-added',
    //   (actor, child) => {
    //     journal('=== CHILD ADDED ===');
    //     journal('child: ' + child);
    //     journal('role: ' + (child._panelRole || 'unknown'));
    //   }
    // );

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

  organizePanelItems(boxType, itemOrder) {
    const panel = Main.panel;
    const box = panel[`_${boxType}Box`];

    if (!box) {
      journal(`ERROR: ${boxType} box not found`);
      return;
    }

    journal(`=== Moving items to ${boxType} box ===`);

    // Remove items from their current boxes and add to target box
    itemOrder.forEach(role => {
      const indicator = panel.statusArea[role];
      if (indicator && indicator.container) {
        const container = indicator.container;

        // Remove from current parent if it exists
        const currentParent = container.get_parent();
        if (currentParent) {
          currentParent.remove_child(container);
        }

        // Add to target box
        box.add_child(container);
        journal(`Moved to ${boxType}: ${role}`);
      } else {
        journal(`NOT FOUND: ${role}`);
      }
    });

    journal(`=== ${boxType} box organization complete ===`);
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
