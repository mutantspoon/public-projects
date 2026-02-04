#!/usr/bin/env python3
"""Quill - Lightweight WYSIWYG Markdown Editor

A Typora-style markdown editor using PyWebView and Milkdown.
"""

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
    from src.window import start_app
    start_app()


if __name__ == "__main__":
    main()
