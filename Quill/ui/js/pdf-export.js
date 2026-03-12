/**
 * PDF export — renders the WYSIWYG editor content to a PDF using
 * html2canvas (screenshot) + jsPDF (layout + pagination).
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const A4_W_MM = 210;
const A4_H_MM = 297;
const MARGIN_MM = 15;
const CONTENT_W_MM = A4_W_MM - MARGIN_MM * 2; // 180mm
const CONTENT_H_MM = A4_H_MM - MARGIN_MM * 2; // 267mm

// Width at which content is captured. Wider = smaller relative font size.
// 900px gives body text ~10pt and h1 ~20pt in the final PDF — typical document sizing.
const CAPTURE_WIDTH = 900;

/**
 * Returns a base64-encoded PDF of the current editor content.
 */
export async function generatePdfB64() {
    const el = document.querySelector('#editor .ProseMirror');
    if (!el) throw new Error('Editor content not found');

    const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: CAPTURE_WIDTH,
        windowWidth: CAPTURE_WIDTH,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc, clonedEl) => {
            // Switch to light theme so we get black text, white backgrounds, etc.
            // The CSS is [data-theme='dark'] { dark colors } so removing/changing
            // that attribute switches to the :root light defaults.
            clonedDoc.body.setAttribute('data-theme', 'light');

            // Fill the full capture width with no extra editor chrome padding
            const editorEl = clonedDoc.querySelector('#editor');
            if (editorEl) {
                editorEl.style.cssText = 'padding:0; overflow:visible; height:auto; width:' + CAPTURE_WIDTH + 'px;';
            }

            clonedEl.style.width = CAPTURE_WIDTH + 'px';
            clonedEl.style.overflow = 'visible';
            clonedEl.style.minHeight = '0';
        },
    });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pxPerMm = canvas.width / CONTENT_W_MM;
    const pageHeightPx = CONTENT_H_MM * pxPerMm;
    const totalPages = Math.ceil(canvas.height / pageHeightPx);

    for (let i = 0; i < totalPages; i++) {
        if (i > 0) doc.addPage();

        const srcY = i * pageHeightPx;
        const srcH = Math.min(pageHeightPx, canvas.height - srcY);
        const destH = srcH / pxPerMm;

        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.ceil(srcH);
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

        doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG',
            MARGIN_MM, MARGIN_MM, CONTENT_W_MM, destH);
    }

    const buffer = doc.output('arraybuffer');
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}
