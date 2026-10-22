const storageButton = document.getElementById('toggle-local-storage');
const status = document.getElementById('clear-status');
const storageDisabledKey = 'tfl_storage_disabled';

function updateStorageButton() {
    let storageDisabled;
    try {
        storageDisabled = localStorage.getItem(storageDisabledKey) === 'true';
    } catch (error) {
        console.error('Unable to read local app storage preference:', error);
        storageButton.disabled = true;
        status.textContent = 'Browser storage is unavailable. Use your browser site-data settings to remove app data.';
        return;
    }
    storageButton.textContent = storageDisabled
        ? 'Resume saving settings on this device'
        : 'Stop saving and clear app data';
}

updateStorageButton();

storageButton.addEventListener('click', async () => {
    storageButton.disabled = true;

    try {
        if (localStorage.getItem(storageDisabledKey) === 'true') {
            localStorage.removeItem(storageDisabledKey);
            navigator.serviceWorker?.controller?.postMessage({ type: 'enable-storage' });
            status.textContent = 'Saving preferences on this device is enabled again.';
        } else {
            status.textContent = 'Clearing saved app data…';
            navigator.serviceWorker?.controller?.postMessage({ type: 'disable-storage' });
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith('tfl_') || key.startsWith('notified_') || key === 'theme') {
                    localStorage.removeItem(key);
                }
            }
            localStorage.setItem(storageDisabledKey, 'true');

            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames
                    .filter(name => name.startsWith('tfl-commuter-') || name === 'tfl-pwa-v2')
                    .map(name => caches.delete(name)));
            }
            status.textContent = 'Saved app settings and offline caches were cleared. The app will not save new settings on this device until you enable saving again.';
        }

        updateStorageButton();
    } catch (error) {
        console.error('Unable to update local app storage preference:', error);
        status.textContent = 'The storage preference could not be updated. Use your browser site-data settings to remove app data.';
    } finally {
        storageButton.disabled = false;
    }
});
