async function toggleAddListModal( x,y ) {
    const modalAddList = document.getElementById('modalAddList');
    const isOpen = !modalAddList.classList.contains('hidden');
    modalAddList.dataset.sbModalDisplay = 'flex';

    if ( x ) {
        modalAddList.style.position = 'absolute';
        modalAddList.style.top = y + 'px';
        modalAddList.style.left = x + 'px';
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddList, true, {
                display: 'flex',
                initialFocus: '#userInputListName',
                label: 'Add list',
            });
        } else {
            modalAddList.classList.remove('hidden');
            modalAddList.style.display = 'flex';
            modalAddList.setAttribute('aria-hidden', 'false');
        }
        return;
    }

    if ( isOpen ) {
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddList, false);
        } else {
            modalAddList.classList.add('hidden');
            modalAddList.style.display = 'none';
            modalAddList.setAttribute('aria-hidden', 'true');
        }
    } else {
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddList, true, {
                display: 'flex',
                initialFocus: '#userInputListName',
                label: 'Add list',
            });
        } else {
            modalAddList.classList.remove('hidden');
            modalAddList.style.display = 'flex';
            modalAddList.setAttribute('aria-hidden', 'false');
        }
    }
}
