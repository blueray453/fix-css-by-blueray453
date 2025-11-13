import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { setLogging, setLogFn, journal } from './utils.js'

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


    const messageTrayContainer = Main.messageTray.get_first_child();

    this._themeSignalId = messageTrayContainer?.connect("child-added", () => {
      const notificationContainer = messageTrayContainer?.get_first_child();
      const notification = notificationContainer?.get_first_child();

      journal(`notification: ${notification}`);

      const header = notification?.get_child_at_index(0);
      const headerContent = header?.get_child_at_index(1);
      const headerContentSource = headerContent?.get_child_at_index(0);
      const headerContentTime = headerContent?.get_child_at_index(1);

      const content = notification?.get_child_at_index(1);
      const contentContent = content?.get_child_at_index(1);
      const contentContentTitle = contentContent?.get_child_at_index(0);
      const contentContentBody = contentContent?.get_child_at_index(1);

      // Set app name to green
      if (headerContentSource) {
        journal(`headerContentSource: ${headerContentSource}`);
        // journal(`headerContentSource: ${headerContentSource.get_style_class_name()}`);
        // journal(`headerContentSource: ${headerContentSource.get_style()}`);
        // journal(`headerContentSource: ${headerContentSource.get_style_pseudo_class()}`);

        const bgColor = notificationContainer.get_theme_node().get_background_color();
        journal(`bgColor is ${bgColor}`);
        if (bgColor) {
          const { red, green, blue } = bgColor;

          journal(`Red: ${red}`);
          journal(`Green: ${green}`);
          journal(`Blue: ${blue}`);
        }

        headerContentSource.set_style('color: #00ff00;');
      }

      // Set time to red
      if (headerContentTime) {
        headerContentTime.set_style('color: #ff0000;');
      }

      // Set title to yellow
      if (contentContentTitle) {
        contentContentTitle.set_style('color: #ffff00;');
      }

      // Set body to blue
      if (contentContentBody) {
        contentContentBody.set_style('color: #0000ff;');
      }

      // Set background to purple and log current background
      if (notificationContainer) {
        // Get current background color (for inspection)
        const currentBackground = notificationContainer.get_style();
        journal(`Current notification background style: ${currentBackground}`);

        // Set new background to purple
        notificationContainer.set_style('background-color: #6a0dad; border-radius: 12px;');
      }
    });
  }

  disable() {
    if (this._themeSignalId) {
      const messageTrayContainer = Main.messageTray.get_first_child();
      messageTrayContainer?.disconnect(this._themeSignalId);
      this._themeSignalId = null;
    }
  }
}
