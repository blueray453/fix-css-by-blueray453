import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class NotificationThemeExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._themeSignalId = null;
  }

  enable() {
    // Main.notify('My Extension', 'This is a notification from my GNOME extension!');
    // global.notify_error("msg", "details");
    // Nothing to do; stylesheet.css handles everything
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
      const contentContentBody = contentContent?.get_child_at_index(1);

      // Set app name to green
      if (headerContentSource) {
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
        const currentBackground = notificationContainer.get_style_class_name();
        console.log('Current notification background style:', currentBackground);

        // Set new background to purple
        notificationContainer.set_style('background-color: #6a0dad; border-radius: 12px;');
      }

      const bgColor = notificationContainer.get_background_color();
      if (bgColor) {
          const red = Math.round(bgColor.red / 255);
          const green = Math.round(bgColor.green / 255);
          const blue = Math.round(bgColor.blue / 255);
          const alpha = bgColor.alpha / 255;
          console.log('Computed BG color:', { red, green, blue, alpha });
          console.log('Hex:', `#${red.toString(16)}${green.toString(16)}${blue.toString(16)}`);
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
