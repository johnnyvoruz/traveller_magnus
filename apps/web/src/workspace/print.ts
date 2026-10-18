/**
 * Print and PDF (UX backlog U31; streams/D.md DU31): one page of the app on paper, through the
 * browser's own print dialog, where "Save as PDF" is the PDF. No second renderer and no server.
 *
 * The page is copied into a print-only root at the foot of the body, with what the copy would lose
 * put back: typed values, ticked boxes, chosen options, drawn canvases, folded sections opened. The
 * print stylesheet (PrintButton.vue) shows that root alone, in ink on white. The copy goes once the
 * dialog closes, and before the next one opens.
 */
import { onAfterPrint, printPage } from '../platform/browser.ts';

const ROOT_CLASS = 'print-root';

/** The copy to print: values, ticks, choices, canvases and open sections carried over; ids dropped. */
export function printableCopy(source: HTMLElement): HTMLElement {
    const copy = source.cloneNode(true) as HTMLElement;
    const fields = 'input, textarea, select';
    const from = [...source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fields)];
    const to = [...copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fields)];
    from.forEach((field, i) => {
        const twin = to[i];
        if (!twin) return;
        if (field instanceof HTMLInputElement && twin instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
            twin.checked = field.checked;
            if (field.checked) twin.setAttribute('checked', '');
            else twin.removeAttribute('checked');
            return;
        }
        if (field instanceof HTMLSelectElement && twin instanceof HTMLSelectElement) {
            twin.selectedIndex = field.selectedIndex;
            return;
        }
        twin.value = field.value;
        if (twin instanceof HTMLTextAreaElement) twin.textContent = field.value;
        else twin.setAttribute('value', field.value);
    });
    const canvases = [...source.querySelectorAll('canvas')];
    const twins = [...copy.querySelectorAll('canvas')];
    canvases.forEach((canvas, i) => {
        const twin = twins[i];
        const ctx = twin ? twin.getContext('2d') : null;
        if (!twin || !ctx || canvas.width === 0 || canvas.height === 0) return;
        twin.width = canvas.width;
        twin.height = canvas.height;
        ctx.drawImage(canvas, 0, 0);
    });
    for (const fold of copy.querySelectorAll('details')) fold.open = true;
    for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
    copy.removeAttribute('id');
    return copy;
}

let stopAfter: (() => void) | null = null;
let titleBefore: string | null = null;

/** The print root and the title back as they were. */
export function endPrint(): void {
    for (const root of document.querySelectorAll('.' + ROOT_CLASS)) root.remove();
    document.documentElement.removeAttribute('data-printing');
    if (titleBefore !== null) document.title = titleBefore;
    titleBefore = null;
    if (stopAfter) stopAfter();
    stopAfter = null;
}

/**
 * Prints `source` on its own. `title` names the printout: the PDF's file name, and the browser's
 * header line when it prints one.
 */
export function printCopy(source: HTMLElement, title: string): void {
    endPrint();
    const root = document.createElement('div');
    root.className = ROOT_CLASS;
    root.appendChild(printableCopy(source));
    document.body.appendChild(root);
    document.documentElement.setAttribute('data-printing', '');
    titleBefore = document.title;
    document.title = title;
    stopAfter = onAfterPrint(endPrint);
    printPage();
}
