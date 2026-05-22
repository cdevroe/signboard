async function toggleAddCardToListModal( x,y ) {
    const modalAddCardToList = document.getElementById('modalAddCardToList');
    const isOpen = !modalAddCardToList.classList.contains('hidden');
    modalAddCardToList.dataset.sbModalDisplay = 'flex';
    
    if ( x ) {
        modalAddCardToList.style.position = 'absolute';
        modalAddCardToList.style.top = y + 'px';
        modalAddCardToList.style.left = x + 'px';
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddCardToList, true, {
                display: 'flex',
                initialFocus: '#userInputCardName',
                label: 'Quick add card',
            });
        } else {
            modalAddCardToList.classList.remove('hidden');
            modalAddCardToList.style.display = 'flex';
            modalAddCardToList.setAttribute('aria-hidden', 'false');
        }
        return;
    }

    if ( isOpen ) {
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddCardToList, false);
        } else {
            modalAddCardToList.classList.add('hidden');
            modalAddCardToList.style.display = 'none';
            modalAddCardToList.setAttribute('aria-hidden', 'true');
        }
    } else {
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddCardToList, true, {
                display: 'flex',
                initialFocus: '#userInputCardName',
                label: 'Quick add card',
            });
        } else {
            modalAddCardToList.classList.remove('hidden');
            modalAddCardToList.style.display = 'flex';
            modalAddCardToList.setAttribute('aria-hidden', 'false');
        }
    }
}
