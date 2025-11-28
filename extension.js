import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { setLogging, setLogFn, journal } from './utils.js'

const Panel = Main.panel;
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

    // Move panel to bottom
    Main.layoutManager.panelBox.set_position(0, 0 + global.get_screen_height() - Panel.height);

    // Main.panel._centerBox.connect('child-added', (box, child) => {
    //   // Move the child from center to right box
    //   box.remove_child(child);
    //   journal(`Child is: ${child}`)
    //   Main.panel._rightBox.add_child(child);
    // });

    // // Have to enable disable as this needs to be the last
    // // The following code needs to be run after the menu is populated
    // // See what's currently in each box
    // journal('=== LEFT BOX ===');
    // Panel._leftBox.get_children().forEach((child, index) => {
    //   let role = null;
    //   for (const r in StatusArea) {
    //     if (StatusArea[r].container === child) {
    //       role = r;
    //       break;
    //     }
    //   }
    //   journal(`[${index}]: ${role || 'unknown'}`);
    // });

    // journal('=== CENTER BOX ===');
    // Panel._centerBox.get_children().forEach((child, index) => {
    //   let role = null;
    //   for (const r in StatusArea) {
    //     if (StatusArea[r].container === child) {
    //       role = r;
    //       break;
    //     }
    //   }
    //   journal(`[${index}]: ${role || 'unknown'}`);
    // });

    // journal('=== RIGHT BOX ===');
    // Panel._rightBox.get_children().forEach((child, index) => {
    //   let role = null;
    //   for (const r in StatusArea) {
    //     if (StatusArea[r].container === child) {
    //       role = r;
    //       break;
    //     }
    //   }
    //   journal(`[${index}]: ${role || 'unknown'}`);
    // });

    // Hardcoded center box order
    const CENTER_ORDER = [
    ];

    const RIGHT_ORDER = [
      "ShowNetSpeedButton",
      "printers",
      "lockkeys@febueldo.test",
      "color-picker@tuberry", // Fixed: removed space
      "clipboardIndicator",
      "athan@goodm4ven",
    ];

    // const PANEL_ITEM_IMPLEMENTATIONS = {
    //     'activities': ActivitiesButton,
    //     'quickSettings': QuickSettings,
    //     'dateMenu': DateMenuButton,
    //     'a11y': ATIndicator,
    //     'keyboard': InputSourceIndicator,
    //     'dwellClick': DwellClickIndicator,
    //     'screenRecording': ScreenRecordingIndicator,
    //     'screenSharing': ScreenSharingIndicator,
    // };

    // // Interfare with dash to panel
    // const RIGHT_ORDER = [
    //   "ShowNetSpeedButton",
    //   "printers",
    //   "lockkeys@febueldo.test",
    //   "color-picker@tuberry", // Fixed: removed space
    //   "clipboardIndicator",
    //   "athan@goodm4ven",
    //   "dateMenu",
    //   "screenRecording",
    //   "screenSharing",
    //   "dwellClick",
    //   "a11y",
    //   "keyboard",
    //   "quickSettings"
    // ];

    let attempts = 0;

    let ALL_ORDER = [...CENTER_ORDER, ...RIGHT_ORDER];
    // Start polling every 200ms
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
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
        // journal(`Attempt ${attempts}`);
        // journal("All center and right roles found — panel ready!");

        // Run your organization logic now
        this.organizePanelItems('center', CENTER_ORDER);
        this.organizePanelItems('right', RIGHT_ORDER);

        return GLib.SOURCE_REMOVE; // stop polling
      }

      // Polling Limit
      if (attempts >= 25) {
        // journal("Stopped polling after 25 attempts — roles not fully found.");
        return GLib.SOURCE_REMOVE; // Stop regardless of success
      }

      return GLib.SOURCE_CONTINUE; // keep polling
    });

    Main.panel.statusArea["activities"].hide();

    this.scrollEventId = Main.panel.connect('scroll-event', (_actor, event) => Main.wm.handleWorkspaceScroll(event));
  }

  organizePanelItems(boxType, itemOrder) {
    const panel = Panel;
    const box = panel[`_${boxType}Box`];

    if (!box) {
      // journal(`ERROR: ${boxType} box not found`);
      return;
    }

    // journal(`=== Moving items to ${boxType} box ===`);

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
        // journal(`Moved to ${boxType}: ${role}`);
      } else {
        // journal(`NOT FOUND: ${role}`);
      }
    });

    // journal(`=== ${boxType} box organization complete ===`);
  }

  disable() {
    // Move panel back to top
    Main.layoutManager.panelBox.set_position(0, 0);

    Main.panel.statusArea["activities"].show();

    if (this.scrollEventId != null) {
      Main.panel.disconnect(this.scrollEventId);
      this.scrollEventId = null;
    }
  }
}
