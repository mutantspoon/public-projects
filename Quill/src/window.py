"""Window management for Quill."""

import json
import logging
import os
import platform
import sys
import threading
import time
from pathlib import Path

import webview

from .api import Api
from .settings import Settings

logger = logging.getLogger(__name__)

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


def save_window_state(window: webview.Window, settings: Settings):
    """Save window position and size to settings."""
    try:
        settings.set("window_x", window.x)
        settings.set("window_y", window.y)
        settings.set("window_width", window.width)
        settings.set("window_height", window.height)
    except Exception:
        pass


def on_closing(window: webview.Window, api: Api, settings: Settings):
    """Handle window close event.

    Blocks the close immediately and delegates to JS for dirty-tab checks
    and save dialogs. JS calls api.force_close() when ready to close.

    evaluate_js is fired from a background thread so on_closing returns
    instantly and never blocks the macOS main thread. Calling evaluate_js
    with an async JS function inline here deadlocks on macOS because
    PyWebView awaits the Promise while the main thread is blocked.
    """
    if api._force_closing:
        save_window_state(window, settings)
        return True

    def trigger():
        try:
            window.evaluate_js("window._quillHandleAppClose()")
        except Exception:
            pass

    threading.Thread(target=trigger, daemon=True).start()
    return False


def on_moved(x: int, y: int, api: Api, settings: Settings):
    """Handle window move event."""
    # No-op: on_closing saves final position to avoid disk I/O spam during drag
    pass


def on_resized(width: int, height: int, api: Api, settings: Settings):
    """Handle window resize event."""
    # No-op: on_closing saves final size to avoid disk I/O spam during resize
    pass


def _open_file_via_js(window: webview.Window, file_path: str):
    """Read a file from disk and inject it into the editor via JS.

    Retries evaluate_js for up to ~3 seconds in case the WebView hasn't
    finished loading yet when called (common on fresh app launch).
    """
    try:
        path_obj = Path(file_path)
        if not path_obj.exists():
            return
        try:
            content = path_obj.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = path_obj.read_text(encoding="latin-1")
        js = f"window._quillOpenStartupFile({json.dumps(file_path)}, {json.dumps(content)})"
        for _ in range(30):
            try:
                window.evaluate_js(js)
                return
            except Exception:
                time.sleep(0.1)
    except Exception as e:
        logger.warning(f"Failed to open file via JS: {e}")


def _setup_macos_open_handler(window: webview.Window) -> None:
    """Inject application:openFile: into PyWebView's AppDelegate class.

    On macOS, Finder delivers file-open requests by calling
    application:openFile: on the NSApplicationDelegate. PyWebView's built-in
    AppDelegate doesn't implement this method, so Finder either shows an error
    or silently drops the request.

    This function patches the method onto PyWebView's AppDelegate *class*
    (not instance) before webview.start() creates an instance of it. The
    injected method is a closure that captures `window` so it can call
    evaluate_js to load the file once the WebView is ready.
    """
    try:
        import objc
        from webview.platforms.cocoa import BrowserView

        SUPPORTED = {".md", ".markdown", ".txt"}

        def application_openFile_(self, application, filename):
            path = str(filename)
            if Path(path).suffix.lower() not in SUPPORTED:
                # macOS may call this with Python's own script files during
                # startup — accept silently so no error dialog appears.
                return True
            logger.debug(f"application:openFile: {path}")
            threading.Thread(
                target=lambda: _open_file_via_js(window, path),
                daemon=True,
            ).start()
            return True

        def application_openFiles_(self, application, filenames):
            for filename in filenames:
                path = str(filename)
                if Path(path).suffix.lower() not in SUPPORTED:
                    continue
                logger.debug(f"application:openFiles: {path}")
                threading.Thread(
                    target=lambda p=path: _open_file_via_js(window, p),
                    daemon=True,
                ).start()

        objc.classAddMethod(
            BrowserView.AppDelegate,
            b"application:openFile:",
            objc.selector(application_openFile_, signature=b"B@:@@"),
        )
        objc.classAddMethod(
            BrowserView.AppDelegate,
            b"application:openFiles:",
            objc.selector(application_openFiles_, signature=b"v@:@@"),
        )
        logger.debug("Injected application:openFile: into PyWebView AppDelegate")
    except Exception as e:
        logger.warning(f"Could not inject AppDelegate methods: {e}")


def start_app(file_path: str | None = None):
    """Start the application."""
    settings = Settings()
    window, api = create_window(settings)
    api.set_startup_file(file_path)

    # Patch PyWebView's AppDelegate to handle macOS file-open events.
    # Must be called before webview.start() so the method exists on the class
    # when an instance is created and macOS calls application:openFile:.
    if IS_MAC:
        _setup_macos_open_handler(window)

    def on_loaded():
        # Windows "Open with" path: file passed via sys.argv and forwarded by
        # the launch script. Small delay avoids blocking the UI thread.
        if file_path:
            def load_file():
                try:
                    path_obj = Path(file_path)
                    if path_obj.exists() and path_obj.stat().st_size <= 10 * 1024 * 1024:
                        try:
                            content = path_obj.read_text(encoding="utf-8")
                        except UnicodeDecodeError:
                            content = path_obj.read_text(encoding="latin-1")
                        js_code = f"window._quillOpenStartupFile({json.dumps(file_path)}, {json.dumps(content)})"
                        window.evaluate_js(js_code)
                except Exception:
                    pass

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
