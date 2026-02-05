#!/bin/bash
# build.sh — Concatenate JS files into app/signboard.js

# Concatenate in the required order
cat \
  app/utilities/santizeFileName.js \
  app/utilities/timestampListItem.js \
  app/board/boardLabels.js \
  app/board/boardSearch.js \
  app/cards/createCardElement.js \
  app/cards/processAddNewCard.js \
  app/lists/createListElement.js \
  app/cards/processAddNewList.js \
  app/listeners/window.js \
  app/modals/closeAllModals.js \
  app/modals/toggleAddListModal.js \
  app/modals/toggleAddCardModal.js \
  app/modals/toggleAddCardToListModal.js \
  app/modals/toggleEditCardModal.js \
  app/ui/theme.js \
  app/board/renderBoard.js \
  app/board/openBoard.js \
  app/init.js \
  > app/signboard.js

echo "✅ Built app/signboard.js"
