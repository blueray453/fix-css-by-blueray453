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
      "color-picker@tuberry",
      "clipboardIndicator",
      "athan@goodm4ven"
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
        this.safelyReorder('center', CENTER_ORDER);
        this.safelyReorder('right', RIGHT_ORDER);

        return GLib.SOURCE_REMOVE; // stop polling
      }

      // Polling Limit
      if (attempts >= 25) {
        // journal("Stopped polling after 25 attempts — roles not fully found.");
        return GLib.SOURCE_REMOVE; // Stop regardless of success
      }

      return GLib.SOURCE_CONTINUE; // keep polling
    });

    // Main.panel.statusArea["activities"].hide();

    this.scrollEventId = Main.panel.connect('scroll-event', (_actor, event) => Main.wm.handleWorkspaceScroll(event));

    this._moveDate(true);
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

  _moveDate(active) {
    if (active) {
      Main.sessionMode.panel.center = Main.sessionMode.panel.center.filter(item => item != 'dateMenu')
      Main.sessionMode.panel.left = Main.sessionMode.panel.center.filter(item => item != 'activities')
      Main.sessionMode.panel.right.splice(0, 0, 'dateMenu');
      Main.sessionMode.panel.right.push('activities');
      // journal(`Left Array: ${Main.sessionMode.panel.left}`);
      // journal(`Right Array: ${Main.sessionMode.panel.right}`);
    } else {
      Main.sessionMode.panel.right = Main.sessionMode.panel.right.filter(item => item != 'dateMenu')
      Main.sessionMode.panel.center.push('dateMenu');

      Main.sessionMode.panel.right = Main.sessionMode.panel.right.filter(item => item != 'activities')
      Main.sessionMode.panel.left.push('dateMenu');
    }

    Main.panel._updatePanel();
  }

  disable() {
    // Move panel back to top
    Main.layoutManager.panelBox.set_position(0, 0);

    Main.panel.statusArea["activities"].show();

    if (this.scrollEventId != null) {
      Main.panel.disconnect(this.scrollEventId);
      this.scrollEventId = null;
    }

    this._moveDate(false);
  }
}
