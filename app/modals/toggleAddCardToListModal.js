async function toggleAddCardToListModal( x,y ) {
    const modalAddCardToList = document.getElementById('modalAddCardToList');
    
    if ( x ) {
        modalAddCardToList.style.position = 'absolute';
        modalAddCardToList.style.top = y + 'px';
        modalAddCardToList.style.left = x + 'px';
        modalAddCardToList.style.display = 'block';
        return;
    }

    if ( modalAddCardToList.style.display && modalAddCardToList.style.display == 'block' ) {
        modalAddCardToList.style.display = 'none';
    } else {
        modalAddCardToList.style.display = 'block';        
    }
}