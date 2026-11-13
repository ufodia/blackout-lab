const copyButton = document.querySelector('#copy-install');
const commands = document.querySelector('#install-commands');
const status = document.querySelector('#copy-status');

copyButton?.addEventListener('click', async () => {
  if (!commands || !status) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(commands.textContent || '');
    status.textContent = 'Install commands copied. Run them in your own terminal.';
    copyButton.textContent = 'Copied ✓';
    window.setTimeout(() => {
      copyButton.textContent = 'Copy commands ⧉';
    }, 2400);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(commands);
    selection?.removeAllRanges();
    selection?.addRange(range);
    status.textContent =
      'Commands selected. Use your usual copy shortcut, then paste them into your terminal.';
  }
});
