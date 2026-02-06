"""Window management for Quill."""

import os
import platform
import sys
from pathlib import Path

import webview

from .api import Api
from .settings import Settings

IS_MAC = platform.system() == "Darwin"


def get_ui_path() -> Path:
    """Get the path to the UI directory."""
    if getattr(sys, "frozen", False):
        # Running as PyInstaller bundle
        return Path(sys._MEIPASS) / "ui"
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


def start_app(file_path: str | None = None):
    """Start the application."""
    settings = Settings()
    window, api = create_window(settings)
    api.set_startup_file(file_path)

    # Load startup file via evaluate_js after DOM is ready.
    # This bypasses pywebviewready timing issues on Windows file association launches.
    # Uses a timer to avoid blocking the UI thread during window operations.
    def on_loaded():
        if file_path:
            import json
            import threading

            def load_file():
                try:
                    path_obj = Path(file_path)
                    if path_obj.exists() and path_obj.stat().st_size <= 10 * 1024 * 1024:
                        try:
                            content = path_obj.read_text(encoding="utf-8")
                        except UnicodeDecodeError:
                            content = path_obj.read_text(encoding="latin-1")
                        # Call JS to open the file in a tab
                        js_code = f"window._quillOpenStartupFile({json.dumps(file_path)}, {json.dumps(content)})"
                        window.evaluate_js(js_code)
                except Exception:
                    pass

            # Small delay to let UI thread stabilize after load
            threading.Timer(0.3, load_file).start()

    window.events.loaded += on_loaded

    # Set up event handlers
    window.events.closing += lambda: on_closing(window, api, settings)
    window.events.moved += lambda x, y: on_moved(x, y, api, settings)
    window.events.resized += lambda w, h: on_resized(w, h, api, settings)

    # Define explicit storage path in AppData for WebView2 cache.
    # Prevents permission errors when app dir is read-only or locked
    # (common during "Open with" or when installed in Program Files).
    storage_path = None
    app_data = os.getenv("APPDATA")
    if app_data:
        storage_path = os.path.join(app_data, "Quill", "webview")
        try:
            os.makedirs(storage_path, exist_ok=True)
        except OSError:
            storage_path = None

    # Start the webview with native GUI toolkit
    webview.start(
        debug=os.environ.get("QUILL_DEBUG", "").lower() == "true",
        private_mode=False,  # Allow localStorage for settings
        storage_path=storage_path,
    )
