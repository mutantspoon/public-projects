"""Window management for Quill."""

import os
import platform
from pathlib import Path

import webview

from .api import Api
from .settings import Settings

IS_MAC = platform.system() == "Darwin"


def get_ui_path() -> Path:
    """Get the path to the UI directory."""
    return Path(__file__).parent.parent / "ui"


def create_window(settings: Settings) -> tuple[webview.Window, Api]:
    """Create the main application window."""
    api = Api(settings)

    # Get window size from settings
    width = settings.get("window_width", 1000)
    height = settings.get("window_height", 700)

    # Get window position from settings
    x = settings.get("window_x")
    y = settings.get("window_y")

    # Path to the HTML file - use file:// URL for proper loading
    ui_path = get_ui_path()
    html_path = ui_path / "index.html"
    html_url = html_path.as_uri()

    # Create the window
    window = webview.create_window(
        title="Quill - Untitled",
        url=html_url,
        width=width,
        height=height,
        x=x,
        y=y,
        min_size=(400, 300),
        js_api=api,
        text_select=True,
    )

    # Give API access to window
    api.set_window(window)

    return window, api


def on_closing(window: webview.Window, api: Api, settings: Settings):
    """Handle window close event."""
    # Save window position and size
    try:
        settings.set("window_x", window.x)
        settings.set("window_y", window.y)
        settings.set("window_width", window.width)
        settings.set("window_height", window.height)
    except Exception:
        pass  # Ignore errors during close
    return True  # Allow close


def on_moved(x: int, y: int, api: Api, settings: Settings):
    """Handle window move event."""
    # No-op: on_closing saves final position to avoid disk I/O spam during drag
    pass


def on_resized(width: int, height: int, api: Api, settings: Settings):
    """Handle window resize event."""
    # No-op: on_closing saves final size to avoid disk I/O spam during resize
    pass


def start_app():
    """Start the application."""
    settings = Settings()
    window, api = create_window(settings)

    # Set up event handlers
    window.events.closing += lambda: on_closing(window, api, settings)
    window.events.moved += lambda x, y: on_moved(x, y, api, settings)
    window.events.resized += lambda w, h: on_resized(w, h, api, settings)

    # Start the webview with native GUI toolkit
    webview.start(
        debug=os.environ.get("QUILL_DEBUG", "").lower() == "true",
        private_mode=False,  # Allow localStorage for settings
    )
