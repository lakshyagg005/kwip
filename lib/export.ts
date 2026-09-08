import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/**
 * Downloads a DOM element as a high-resolution PNG image with clean white background.
 */
export async function downloadElementAsPng(elementId: string, filename: string): Promise<void> {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Element with id "${elementId}" not found for PNG export.`);
  }

  try {
    if (document.fonts) {
      await document.fonts.ready;
    }

    const dataUrl = await toPng(node, {
      quality: 0.98,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
    });

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('PNG Export error:', err);
    throw new Error('Failed to generate PNG export.');
  }
}

/**
 * Downloads a multi-page or single-page PDF document with exact 210x297mm A4 page mapping.
 */
export async function downloadElementAsPdf(elementId: string, filename: string): Promise<void> {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Element with id "${elementId}" not found for PDF export.`);
  }

  try {
    if (document.fonts) {
      await document.fonts.ready;
    }

    // Find all single page elements inside container if present
    const pageElements = Array.from(node.querySelectorAll<HTMLElement>('.kwip-pdf-single-page'));
    const targetsToRender = pageElements.length > 0 ? pageElements : [node];

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const defaultPageWidth = pdf.internal.pageSize.getWidth();   // 210mm
    const defaultPageHeight = pdf.internal.pageSize.getHeight(); // 297mm

    for (let i = 0; i < targetsToRender.length; i++) {
      const target = targetsToRender[i];
      const dataUrl = await toPng(target, {
        quality: 0.98,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });

      const targetWidth = target.offsetWidth || 794;
      const targetHeight = target.offsetHeight || 1123;
      const renderHeight = (targetHeight / targetWidth) * defaultPageWidth;

      if (i === 0) {
        if (renderHeight > defaultPageHeight) {
          // Re-initialize first page format if custom height is required
          pdf.deletePage(1);
          pdf.addPage([defaultPageWidth, renderHeight], 'portrait');
        }
      } else {
        pdf.addPage([defaultPageWidth, Math.max(renderHeight, defaultPageHeight)], 'portrait');
      }

      pdf.addImage(dataUrl, 'PNG', 0, 0, defaultPageWidth, renderHeight);
    }

    pdf.save(`${filename}.pdf`);
  } catch (err) {
    console.error('PDF Export error:', err);
    throw new Error('Failed to generate PDF export.');
  }
}

/**
 * Downloads a single Carousel slide as a 1080x1350 4:5 image.
 */
export async function downloadCarouselSlide(slideElementId: string, filename: string): Promise<void> {
  await downloadElementAsPng(slideElementId, filename);
}

/**
 * Exports multiple carousel slides as a multi-page PDF document.
 */
export async function downloadCarouselDeckAsPdf(slideElementIds: string[], filename: string): Promise<void> {
  if (slideElementIds.length === 0) return;

  try {
    if (document.fonts) {
      await document.fonts.ready;
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [1080, 1350],
    });

    for (let i = 0; i < slideElementIds.length; i++) {
      const node = document.getElementById(slideElementIds[i]);
      if (!node) continue;

      const dataUrl = await toPng(node, {
        quality: 0.98,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });

      if (i > 0) {
        pdf.addPage([1080, 1350], 'portrait');
      }

      pdf.addImage(dataUrl, 'PNG', 0, 0, 1080, 1350);
    }

    pdf.save(`${filename}_deck.pdf`);
  } catch (err) {
    console.error('Carousel Deck Export error:', err);
    throw new Error('Failed to export carousel deck as PDF.');
  }
}
