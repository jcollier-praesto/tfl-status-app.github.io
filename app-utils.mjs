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
    const destination = preferences?.destination;
    const validOrigin = origin
        && Number.isFinite(origin.lat)
        && origin.lat >= -90
        && origin.lat <= 90
        && Number.isFinite(origin.lon)
        && origin.lon >= -180
        && origin.lon <= 180
        && typeof origin.name === 'string';
    const validDestination = destination
        && Number.isFinite(destination.lat)
        && destination.lat >= -90
        && destination.lat <= 90
        && Number.isFinite(destination.lon)
        && destination.lon >= -180
        && destination.lon <= 180
        && typeof destination.name === 'string';

    return {
        origin: validOrigin ? origin : {
            lat: 51.5074,
            lon: -0.1278,
            name: 'Central London (Default)'
        },
        destination: validDestination ? destination : null,
        distanceUnit: preferences?.distanceUnit === 'miles' ? 'miles' : 'km',
        theme: preferences?.theme === 'light' || preferences?.theme === 'dark' ? preferences.theme : null
    };
}

export function normalizeJourneyOptions(journeys) {
    if (!Array.isArray(journeys)) return [];

    const routes = [];
    const routeKeys = new Set();
    journeys.forEach(journey => {
        if (!Number.isFinite(journey?.duration) || !Array.isArray(journey.legs)) return;
        const legs = journey.legs.map(leg => {
            const mode = String(leg?.mode?.name || 'unknown').toLowerCase();
            const lineName = mode === 'tube'
                ? String(leg?.routeOptions?.[0]?.name || '')
                : '';
            return {
                mode,
                lineName,
                instruction: leg?.instruction?.summary || leg?.instruction?.detailed || '',
                departure: leg?.departurePoint?.commonName || '',
                arrival: leg?.arrivalPoint?.commonName || '',
                duration: Number.isFinite(leg?.duration) ? leg.duration : 0,
                disruptions: Array.isArray(leg?.disruptions)
                    ? leg.disruptions.map(disruption => disruption?.description).filter(Boolean)
                    : []
            };
        });
        const tubeLegs = legs.filter(leg => leg.mode === 'tube');
        if (!tubeLegs.length) return;

        const routeKey = legs.map(leg =>
            `${leg.mode}:${leg.lineName}:${leg.departure}:${leg.arrival}`
        ).join('|');
        if (routeKeys.has(routeKey)) return;
        routeKeys.add(routeKey);

        const lines = tubeLegs.reduce((list, leg) => {
            if (leg.lineName && list[list.length - 1] !== leg.lineName) list.push(leg.lineName);
            return list;
        }, []);
        routes.push({
            duration: journey.duration,
            arrivalDateTime: journey.arrivalDateTime || '',
            alternativeRoute: Boolean(journey.alternativeRoute),
            legs,
            lines,
            changes: Math.max(0, lines.length - 1),
            walkingMinutes: legs.filter(leg => leg.mode === 'walking').reduce((total, leg) => total + leg.duration, 0),
            disruptions: [...new Set(legs.flatMap(leg => leg.disruptions))]
        });
    });

    return routes;
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
