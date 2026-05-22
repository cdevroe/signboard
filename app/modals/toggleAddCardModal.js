async function toggleAddCardModal( x,y ) {
    const modalAddCard = document.getElementById('modalAddCard');
    const isOpen = !modalAddCard.classList.contains('hidden');
    modalAddCard.dataset.sbModalDisplay = 'flex';

    if ( x ) {
        modalAddCard.style.position = 'absolute';
        modalAddCard.style.top = y + 'px';
        modalAddCard.style.left = x + 'px';
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddCard, true, {
                display: 'flex',
                initialFocus: '#userInput',
                label: 'Add card',
            });
        } else {
            modalAddCard.classList.remove('hidden');
            modalAddCard.style.display = 'flex';
            modalAddCard.setAttribute('aria-hidden', 'false');
        }
        return;
    }

    if ( isOpen ) {
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddCard, false);
        } else {
            modalAddCard.classList.add('hidden');
            modalAddCard.style.display = 'none';
            modalAddCard.setAttribute('aria-hidden', 'true');
        }
    } else {
        if (typeof setAccessibleModalVisible === 'function') {
            setAccessibleModalVisible(modalAddCard, true, {
                display: 'flex',
                initialFocus: '#userInput',
                label: 'Add card',
            });
        } else {
            modalAddCard.classList.remove('hidden');
            modalAddCard.style.display = 'flex';
            modalAddCard.setAttribute('aria-hidden', 'false');
        }
    }
}
