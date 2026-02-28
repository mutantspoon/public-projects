#!/usr/bin/env python3
"""Quill - Lightweight WYSIWYG Markdown Editor

A Typora-style markdown editor using PyWebView and Milkdown.
"""

import os
import platform
import sys

# Windows DPI awareness
if platform.system() == "Windows":
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        pass


def main():
    # Fix CWD for "Open with" file association launches.
    # Windows sets CWD to the file's directory, but pywebview needs
    # the app directory to find its dependencies.
    if getattr(sys, "frozen", False):
        os.chdir(os.path.dirname(sys.executable))

    from src.window import start_app

    # Accept a file path as command-line argument (used by file associations).
    # Filter out macOS process serial numbers (-psn_0_XXXXX) passed by Finder.
    file_path = sys.argv[1] if len(sys.argv) > 1 else None
    if file_path and file_path.startswith("-psn"):
        file_path = None

    start_app(file_path=file_path)


if __name__ == "__main__":
    main()
