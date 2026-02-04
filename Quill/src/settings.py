"""Settings management for Quill."""

import json
import logging
import platform
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

IS_MAC = platform.system() == "Darwin"
IS_WINDOWS = platform.system() == "Windows"

DEFAULT_SETTINGS = {
    "theme": "dark",
    "font_size": 14,
    "word_wrap": True,
    "window_width": 1000,
    "window_height": 700,
    "window_x": None,
    "window_y": None,
    "recent_files": [],
}


def get_config_dir() -> Path:
    """Get the platform-appropriate config directory."""
    if IS_MAC:
        config_dir = Path.home() / "Library" / "Application Support" / "Quill"
    elif IS_WINDOWS:
        import os
        config_dir = Path(os.environ.get("APPDATA", Path.home())) / "Quill"
    else:
        config_dir = Path.home() / ".quill"

    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def get_config_file() -> Path:
    """Get the path to the settings file."""
    return get_config_dir() / "settings.json"


class Settings:
    """Manages application settings."""

    def __init__(self):
        self._settings = DEFAULT_SETTINGS.copy()
        self.load()

    def load(self):
        """Load settings from disk."""
        config_file = get_config_file()
        if config_file.exists():
            try:
                with open(config_file, "r") as f:
                    saved = json.load(f)
                    self._settings.update(saved)
                    logger.info(f"Settings loaded from {config_file}")
            except json.JSONDecodeError as e:
                logger.error(f"Settings file corrupted, using defaults: {e}")
            except IOError as e:
                logger.error(f"Could not read settings file: {e}")

    def save(self):
        """Save settings to disk."""
        config_file = get_config_file()
        try:
            with open(config_file, "w") as f:
                json.dump(self._settings, f, indent=2)
        except IOError as e:
            logger.error(f"Could not save settings: {e}")

    def get(self, key: str, default=None):
        """Get a setting value."""
        return self._settings.get(key, default)

    def set(self, key: str, value):
        """Set a setting value and save."""
        self._settings[key] = value
        self.save()

    @property
    def theme(self) -> str:
        return self._settings["theme"]

    @theme.setter
    def theme(self, value: str):
        self.set("theme", value)

    @property
    def font_size(self) -> int:
        return self._settings["font_size"]

    @font_size.setter
    def font_size(self, value: int):
        self.set("font_size", max(8, min(32, value)))

    @property
    def word_wrap(self) -> bool:
        return self._settings["word_wrap"]

    @word_wrap.setter
    def word_wrap(self, value: bool):
        self.set("word_wrap", value)
