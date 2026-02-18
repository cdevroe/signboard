const TIMESTAMP_MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

function formatTimestamp(date = new Date()) {
    const monthName = TIMESTAMP_MONTHS[date.getMonth()];
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${monthName} ${day}, ${hours}:${minutes}`;
}

function insertTimestampListItem(textarea, date = new Date()) {
    if (!textarea) {
        return;
    }

    if (typeof textarea.focus === 'function') {
        textarea.focus();
    }

    const value = textarea.value || '';
    let start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
    let end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;

    if (start > end) {
        const swap = start;
        start = end;
        end = swap;
    }

    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', start);
    if (lineEnd === -1) {
        lineEnd = value.length;
    }

    const lineText = value.slice(lineStart, lineEnd);
    const listMatch = lineText.match(/^(\s*)([-*+]|\d+[.)])\s+/);
    const isInList = Boolean(listMatch);
    const indent = isInList ? listMatch[1] : '';
    const marker = isInList ? listMatch[2] : '-';
    const prefix = `${indent}${marker} `;
    const timestamp = formatTimestamp(date);

    let replaceStart = start;
    let replaceEnd = end;
    let insertText = '';
    let caretOffset = 0;

    if (isInList && start === end) {
        const insertPos = lineEnd;
        replaceStart = insertPos;
        replaceEnd = insertPos;
        insertText = `\n${prefix}${timestamp}`;
        caretOffset = insertText.length;
    } else {
        const atLineStart = start === lineStart;
        const atOrBeyondLineEnd = end >= lineEnd;
        const leadingNewline = atLineStart ? '' : '\n';
        const trailingNewline = atOrBeyondLineEnd ? '' : '\n';
        insertText = `${leadingNewline}${prefix}${timestamp}${trailingNewline}`;
        caretOffset = leadingNewline.length + prefix.length + timestamp.length;
    }

    if (typeof textarea.setRangeText === 'function') {
        textarea.setRangeText(insertText, replaceStart, replaceEnd, 'end');
    } else {
        textarea.value = value.slice(0, replaceStart) + insertText + value.slice(replaceEnd);
    }

    if (typeof textarea.setSelectionRange === 'function') {
        const caretPos = replaceStart + caretOffset;
        textarea.setSelectionRange(caretPos, caretPos);
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatTimestamp, insertTimestampListItem };
}
