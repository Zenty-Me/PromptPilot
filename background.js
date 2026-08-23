chrome.commands.onCommand.addListener((command) => {
  if (command === "open-prompt-panel") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "toggle_panel" });
      }
    });
  }
});
