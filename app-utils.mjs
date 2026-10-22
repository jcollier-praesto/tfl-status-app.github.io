export function haversineDistance(lat1, lon1, lat2, lon2) {
    const radiusKm = 6371;
    const toRadians = degrees => degrees * Math.PI / 180;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLon = toRadians(lon2 - lon1);
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
    return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinCommuteWindow(now, commuteTimes, windowMinutes = 30) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return commuteTimes.some(time => {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return false;
        const [hours, minutes] = time.split(':').map(Number);
        const commuteMinutes = hours * 60 + minutes;
        const difference = Math.abs(currentMinutes - commuteMinutes);
        return Math.min(difference, 1440 - difference) <= windowMinutes;
    });
}

export function normalizePreferences(preferences) {
    const origin = preferences?.origin;
    const validOrigin = origin
        && Number.isFinite(origin.lat)
        && origin.lat >= -90
        && origin.lat <= 90
        && Number.isFinite(origin.lon)
        && origin.lon >= -180
        && origin.lon <= 180
        && typeof origin.name === 'string';

    return {
        origin: validOrigin ? origin : {
            lat: 51.5074,
            lon: -0.1278,
            name: 'Central London (Default)'
        },
        distanceUnit: preferences?.distanceUnit === 'miles' ? 'miles' : 'km',
        theme: preferences?.theme === 'light' || preferences?.theme === 'dark' ? preferences.theme : null
    };
}

export function sortLines(lines, sortBy) {
    const sorted = [...lines];
    if (sortBy === 'favorites') {
        sorted.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.distanceKm - b.distanceKm);
    } else if (sortBy === 'proximity') {
        sorted.sort((a, b) => a.distanceKm - b.distanceKm);
    } else if (sortBy === 'status') {
        sorted.sort((a, b) => a.statusSeverity - b.statusSeverity);
    } else if (sortBy === 'alphabetical') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}
