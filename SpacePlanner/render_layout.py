#!/usr/bin/env python3
"""
SpacePlanner .layout file renderer.
Reads a .layout JSON file and outputs a PNG for visual verification.

Usage:
    python3 render_layout.py <file.layout> [output.png]
    python3 render_layout.py <file.layout> --show-layers
"""

import json
import sys
import math
import os
from PIL import Image, ImageDraw, ImageFont

# --- Constants (match SpacePlanner js/constants.js) ---
SCALE = 5           # pixels per inch in layout coords
WALL_THICKNESS = 6  # layout-space pixels

BG_COLOR = (242, 241, 239)   # #F2F1EF
GRID_COLOR = (220, 215, 208)
PADDING = 60        # output image padding in output pixels


DIM_COLOR = (44, 51, 56, 220)   # #2C3338 - matches app dimension label color
DIM_OFFSET = 14                 # pixels from wall/edge to label center


def format_dimension(inches):
    """Match SpacePlanner's formatDimension() in utils.js."""
    feet = int(inches // 12)
    rem = round(inches % 12)
    if rem == 12:
        feet += 1
        rem = 0
    return f"{feet}'" if rem == 0 else f"{feet}' {rem}\""


def draw_rotated_text(img, text, cx, cy, angle_deg, font, color):
    """Draw text centered at (cx, cy) rotated by angle_deg."""
    # Render text onto a temp image, rotate, composite
    dummy = ImageDraw.Draw(img)
    bbox = dummy.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    tmp = Image.new('RGBA', (tw + 4, th + 4), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    td.text((2, 2), text, font=font, fill=color)

    rotated = tmp.rotate(-angle_deg, expand=True)
    rw, rh = rotated.size
    paste_x = int(cx - rw / 2)
    paste_y = int(cy - rh / 2)
    img.paste(rotated, (paste_x, paste_y), rotated)


def hex_to_rgb(hex_color, alpha=255):
    """Convert #RRGGBB to (R, G, B, A)."""
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c*2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, alpha)


def parse_layout(path):
    with open(path) as f:
        return json.load(f)


def get_bounds(objects):
    """Find bounding box of all objects."""
    xs, ys = [], []
    for obj in objects:
        t = obj['type']
        if t == 'wall':
            xs += [obj['x1'], obj['x2']]
            ys += [obj['y1'], obj['y2']]
        elif t == 'rectangle':
            xs += [obj['x'], obj['x'] + obj['width']]
            ys += [obj['y'], obj['y'] + obj['height']]
        elif t in ('label', 'text'):
            xs.append(obj['x'])
            ys.append(obj['y'])
    if not xs:
        return 0, 0, 100, 100
    return min(xs), min(ys), max(xs), max(ys)


def render(layout_path, output_path=None, max_width=1800, max_height=1200):
    data = parse_layout(layout_path)

    objects = data.get('objects', [])
    layers = data.get('layers', [])

    # Build layer order map: layerId -> order
    layer_order = {l['id']: l.get('order', 0) for l in layers}
    layer_visible = {l['id']: l.get('visible', True) for l in layers}
    layer_name = {l['id']: l.get('name', '?') for l in layers}

    # Sort objects by layer order
    def obj_sort_key(obj):
        lid = obj.get('layerId', 'layer-1')
        return layer_order.get(lid, 0)

    sorted_objects = sorted(objects, key=obj_sort_key)

    # Compute bounds
    min_x, min_y, max_x, max_y = get_bounds(objects)
    layout_w = max_x - min_x
    layout_h = max_y - min_y

    if layout_w == 0 or layout_h == 0:
        print("No drawable objects found.")
        return

    # Compute scale factor to fit within max dimensions
    scale = min(
        (max_width - PADDING * 2) / layout_w,
        (max_height - PADDING * 2) / layout_h,
        1.0  # never upscale
    )

    img_w = int(layout_w * scale) + PADDING * 2
    img_h = int(layout_h * scale) + PADDING * 2

    def tx(x):
        return int((x - min_x) * scale) + PADDING

    def ty(y):
        return int((y - min_y) * scale) + PADDING

    def ts(px):
        """Scale a thickness value."""
        return max(1, int(px * scale))

    # Create image (RGBA for compositing)
    img = Image.new('RGBA', (img_w, img_h), BG_COLOR + (255,))
    draw = ImageDraw.Draw(img)

    # Draw light grid (1-foot grid)
    foot_px = SCALE * 12  # 60 layout units = 1 foot
    grid_step = int(foot_px * scale)
    if grid_step >= 8:
        # Vertical lines
        x_start = min_x - (min_x % foot_px)
        x = x_start
        while x <= max_x:
            sx = tx(x)
            draw.line([(sx, PADDING), (sx, img_h - PADDING)], fill=GRID_COLOR + (255,), width=1)
            x += foot_px
        # Horizontal lines
        y_start = min_y - (min_y % foot_px)
        y = y_start
        while y <= max_y:
            sy = ty(y)
            draw.line([(PADDING, sy), (img_w - PADDING, sy)], fill=GRID_COLOR + (255,), width=1)
            y += foot_px

    # Try to load a font
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", max(10, int(11 * scale)))
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", max(8, int(9 * scale)))
        font_dim = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", max(9, int(10 * scale)))
    except Exception:
        font = ImageFont.load_default()
        font_small = font
        font_dim = font

    # --- Draw objects layer by layer ---
    for obj in sorted_objects:
        lid = obj.get('layerId', 'layer-1')
        if not layer_visible.get(lid, True):
            continue

        t = obj['type']

        if t == 'wall':
            color = hex_to_rgb('#3A3F42')
            w = ts(WALL_THICKNESS)
            x1, y1 = tx(obj['x1']), ty(obj['y1'])
            x2, y2 = tx(obj['x2']), ty(obj['y2'])
            draw.line([(x1, y1), (x2, y2)], fill=color, width=w)
            # Round caps
            r = w // 2
            draw.ellipse([x1-r, y1-r, x1+r, y1+r], fill=color)
            draw.ellipse([x2-r, y2-r, x2+r, y2+r], fill=color)

            # Dimension label at midpoint, offset perpendicular to wall
            dx = obj['x2'] - obj['x1']
            dy = obj['y2'] - obj['y1']
            length_px = math.sqrt(dx*dx + dy*dy)
            if length_px > 20:  # skip tiny stubs
                inches = length_px / SCALE
                label = format_dimension(inches)
                angle_deg = math.degrees(math.atan2(dy, dx))
                # Normalise so text reads left-to-right
                if 90 < angle_deg <= 270 or -270 <= angle_deg < -90:
                    angle_deg += 180
                # Perpendicular offset (always push label to one side)
                perp_x = -dy / length_px * DIM_OFFSET
                perp_y =  dx / length_px * DIM_OFFSET
                mx = (x1 + x2) / 2 + perp_x
                my = (y1 + y2) / 2 + perp_y
                draw_rotated_text(img, label, mx, my, angle_deg, font_dim, DIM_COLOR)
                draw = ImageDraw.Draw(img)  # refresh after paste

        elif t == 'rectangle':
            stroke_color = hex_to_rgb(obj.get('stroke', '#2C3338'))
            fill_val = obj.get('fill', '')
            x, y = tx(obj['x']), ty(obj['y'])
            x2 = tx(obj['x'] + obj['width'])
            y2 = ty(obj['y'] + obj['height'])
            sw = ts(obj.get('strokeWidth', WALL_THICKNESS))

            if fill_val:
                fill_color = hex_to_rgb(fill_val, 200)
                # Draw on a temp RGBA layer for alpha
                overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
                od = ImageDraw.Draw(overlay)
                od.rectangle([x, y, x2, y2], fill=fill_color, outline=stroke_color, width=sw)
                img = Image.alpha_composite(img, overlay)
                draw = ImageDraw.Draw(img)
            else:
                draw.rectangle([x, y, x2, y2], fill=None, outline=stroke_color, width=sw)

            # Width label below, height label to the right
            w_inches = obj['width'] / SCALE
            h_inches = obj['height'] / SCALE
            w_label = format_dimension(w_inches)
            h_label = format_dimension(h_inches)
            cx = (x + x2) / 2
            cy = (y + y2) / 2
            draw_rotated_text(img, w_label, cx, y2 + DIM_OFFSET, 0, font_dim, DIM_COLOR)
            draw_rotated_text(img, h_label, x2 + DIM_OFFSET, cy, 90, font_dim, DIM_COLOR)
            draw = ImageDraw.Draw(img)

        elif t in ('label', 'text'):
            color = hex_to_rgb(obj.get('color', '#2C3338'))
            x, y = tx(obj['x']), ty(obj['y'])
            content = obj.get('content', '')
            draw.text((x, y), content, fill=color, font=font)

    # --- Legend ---
    legend_y = PADDING // 2 - 14
    legend_x = PADDING
    for layer in sorted(layers, key=lambda l: l.get('order', 0)):
        lid = layer['id']
        vis = layer_visible.get(lid, True)
        name = layer['name']
        indicator = '●' if vis else '○'
        draw.text((legend_x, legend_y), f"{indicator} {name}", fill=(80, 80, 80, 255), font=font_small)
        legend_x += int(len(name) * 7 * (scale ** 0.3)) + 30

    # --- Scale bar ---
    # 10 feet in layout space
    ten_feet_px = int(SCALE * 120 * scale)
    bar_x = PADDING
    bar_y = img_h - PADDING // 2 + 4
    draw.line([(bar_x, bar_y), (bar_x + ten_feet_px, bar_y)], fill=(100, 100, 100, 255), width=2)
    draw.line([(bar_x, bar_y - 4), (bar_x, bar_y + 4)], fill=(100, 100, 100, 255), width=2)
    draw.line([(bar_x + ten_feet_px, bar_y - 4), (bar_x + ten_feet_px, bar_y + 4)], fill=(100, 100, 100, 255), width=2)
    draw.text((bar_x + ten_feet_px // 2 - 14, bar_y - 16), "10 ft", fill=(100, 100, 100, 255), font=font_small)

    # Convert to RGB for PNG save
    img_rgb = img.convert('RGB')

    if output_path is None:
        base = os.path.splitext(layout_path)[0]
        output_path = base + '.png'

    img_rgb.save(output_path)
    print(f"Rendered: {output_path} ({img_w}×{img_h}px, scale={scale:.3f})")
    return output_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    layout_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else None
    render(layout_file, out_file)
