"""Python API exposed to JavaScript via PyWebView."""

import logging
import platform
from pathlib import Path

import webview

from .settings import Settings

logger = logging.getLogger(__name__)

IS_MAC = platform.system() == "Darwin"
MAX_RECENT_FILES = 10


class Api:
    """API class exposed to JavaScript."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.window = None
        self._current_file = None
        self._modified = False
        self._startup_file = None

    def set_window(self, window):
        """Set the webview window reference."""
        self.window = window

    def set_startup_file(self, file_path: str | None):
        """Set a file to open on startup (from command-line argument)."""
        self._startup_file = file_path

    def get_startup_file(self):
        """Return startup file content if one was provided via command-line.

        Called by JS after editor initialization. Returns the file content
        once, then clears the startup file so subsequent calls return None.
        """
        if not self._startup_file:
            return None

        file_path = self._startup_file
        self._startup_file = None  # Only serve once

        try:
            path = Path(file_path)
            if not path.exists():
                return None

            file_size = path.stat().st_size
            if file_size > 10 * 1024 * 1024:  # 10MB
                return None

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except UnicodeDecodeError:
                with open(file_path, "r", encoding="latin-1") as f:
                    content = f.read()

            self._current_file = file_path
            self._modified = False
            self._update_title()
            self.add_recent_file(file_path)
            return {"content": content, "path": file_path}
        except Exception:
            return None

    # ─── Recent Files ────────────────────────────────────────────────────

    def get_recent_files(self):
        """Get list of recent files."""
        return self.settings.get("recent_files", [])

    def add_recent_file(self, file_path: str):
        """Add a file to the recent files list."""
        recent = self.settings.get("recent_files", [])

        # Remove if already exists (will re-add at top)
        if file_path in recent:
            recent.remove(file_path)

        # Add at the beginning
        recent.insert(0, file_path)

        # Keep only the last N files
        recent = recent[:MAX_RECENT_FILES]

        self.settings.set("recent_files", recent)

    def clear_recent_files(self):
        """Clear the recent files list."""
        self.settings.set("recent_files", [])

    # ─── File Operations ─────────────────────────────────────────────────

    def new_file(self):
        """Clear editor, reset file state."""
        self._current_file = None
        self._modified = False
        self._update_title()
        return {"success": True, "content": ""}

    def open_file(self):
        """Show native dialog, return file content."""
        file_types = (
            "Markdown files (*.md;*.markdown)",
            "Text files (*.txt)",
            "All files (*.*)",
        )

        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=file_types,
        )

        if result and len(result) > 0:
            file_path = result[0]
            try:
                # Check file size before loading
                file_size = Path(file_path).stat().st_size
                if file_size > 10 * 1024 * 1024:  # 10MB
                    return {
                        "success": False,
                        "error": f"File is too large ({file_size // 1024 // 1024}MB). Maximum supported size is 10MB.",
                    }

                # Try UTF-8 first, fall back to latin-1 for legacy encodings
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                except UnicodeDecodeError:
                    with open(file_path, "r", encoding="latin-1") as f:
                        content = f.read()

                self._current_file = file_path
                self._modified = False
                self._update_title()
                self.add_recent_file(file_path)
                return {"success": True, "content": content, "path": file_path}
            except Exception as e:
                return {"success": False, "error": str(e)}

        return {"success": False, "cancelled": True}

    def open_recent_file(self, file_path: str):
        """Open a file from the recent files list."""
        try:
            path = Path(file_path)
            if not path.exists():
                # Remove from recent files if it no longer exists
                recent = self.settings.get("recent_files", [])
                if file_path in recent:
                    recent.remove(file_path)
                    self.settings.set("recent_files", recent)
                return {"success": False, "error": "File no longer exists"}

            # Check file size before loading
            file_size = path.stat().st_size
            if file_size > 10 * 1024 * 1024:  # 10MB
                return {
                    "success": False,
                    "error": f"File is too large ({file_size // 1024 // 1024}MB). Maximum supported size is 10MB.",
                }

            # Try UTF-8 first, fall back to latin-1 for legacy encodings
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except UnicodeDecodeError:
                with open(file_path, "r", encoding="latin-1") as f:
                    content = f.read()

            self._current_file = file_path
            self._modified = False
            self._update_title()
            self.add_recent_file(file_path)
            return {"success": True, "content": content, "path": file_path}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def set_current_file(self, file_path: str):
        """Set the current file path (used for drag-and-drop where JS already has content)."""
        self._current_file = file_path
        self._modified = False
        self._update_title()
        self.add_recent_file(file_path)
        return {"success": True, "path": file_path}

    def save_file(self, content: str):
        """Save to current file path."""
        if self._current_file:
            return self._save_to_path(self._current_file, content)
        else:
            return self.save_file_as(content)

    def save_file_as(self, content: str):
        """Show save dialog, save content."""
        file_types = (
            "Markdown files (*.md)",
            "Text files (*.txt)",
            "All files (*.*)",
        )

        result = self.window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename="Untitled.md",
            file_types=file_types,
        )

        if result:
            file_path = result if isinstance(result, str) else result[0]
            return self._save_to_path(file_path, content)

        return {"success": False, "cancelled": True}

    def _save_to_path(self, file_path: str, content: str):
        """Save content to the specified path."""
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            self._current_file = file_path
            self._modified = False
            self._update_title()
            self.add_recent_file(file_path)
            return {"success": True, "path": file_path}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _update_title(self):
        """Update window title."""
        if self.window:
            name = Path(self._current_file).name if self._current_file else "Untitled"
            modified = "*" if self._modified else ""
            self.window.set_title(f"Quill - {name}{modified}")

    def set_modified(self, modified: bool):
        """Set the modified state."""
        self._modified = modified
        self._update_title()

    def get_file_state(self):
        """Get current file state."""
        return {
            "path": self._current_file,
            "modified": self._modified,
            "filename": Path(self._current_file).name if self._current_file else "Untitled",
        }

    # ─── Settings ────────────────────────────────────────────────────────

    def get_settings(self):
        """Return settings dict for JS."""
        return {
            "theme": self.settings.theme,
            "font_size": self.settings.font_size,
            "word_wrap": self.settings.word_wrap,
        }

    def get_theme(self):
        """Return current theme."""
        return self.settings.theme

    def set_theme(self, theme: str):
        """Update theme setting."""
        self.settings.theme = theme
        return {"success": True, "theme": theme}

    def set_font_size(self, size: int):
        """Update font size setting."""
        self.settings.font_size = size
        return {"success": True, "font_size": self.settings.font_size}

    def get_window_size(self):
        """Get saved window size."""
        return {
            "width": self.settings.get("window_width"),
            "height": self.settings.get("window_height"),
        }

    def save_window_size(self, width: int, height: int):
        """Save window size."""
        self.settings.set("window_width", width)
        self.settings.set("window_height", height)

    def get_window_position(self):
        """Get saved window position."""
        return {
            "x": self.settings.get("window_x"),
            "y": self.settings.get("window_y"),
        }

    def save_window_position(self, x: int, y: int):
        """Save window position."""
        self.settings.set("window_x", x)
        self.settings.set("window_y", y)

    def toggle_word_wrap(self):
        """Toggle word wrap setting."""
        current = self.settings.word_wrap
        self.settings.word_wrap = not current
        return {"success": True, "word_wrap": self.settings.word_wrap}

    def set_word_wrap(self, enabled: bool):
        """Set word wrap setting."""
        self.settings.word_wrap = enabled
        return {"success": True, "word_wrap": self.settings.word_wrap}


