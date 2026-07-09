chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== 'number') return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ytm:inject-buttons' });
  } catch (error) {
    console.warn('Could not send manual inject message to tab', error);
  }
});
