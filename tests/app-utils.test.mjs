import test from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    haversineDistance,
    isWithinCommuteWindow,
    nearestStation,
    normalizeJourneyOptions,
    normalizePreferences,
    normalizeTubeStations,
    sortLines
} from '../app-utils.mjs';

test('haversine distance is zero for the same point', () => {
    assert.equal(haversineDistance(51.5, -0.1, 51.5, -0.1), 0);
});

test('haversine distance returns a plausible London station distance', () => {
    const distance = haversineDistance(51.5074, -0.1278, 51.515, -0.1415);
    assert.ok(distance > 1 && distance < 2);
});

test('Tube station results are validated and the nearest station is selected', () => {
    const stations = normalizeTubeStations([
        { naptanId: '940GZZLUSWK', commonName: 'Southwark Underground Station', lat: 51.50427, lon: -0.105331, modes: ['tube'] },
        { id: 'non-tube', name: 'Bus stop', lat: 51.5, lon: -0.1, modes: ['bus'] },
        { id: 'bad-coordinate', name: 'Invalid station', lat: 'not-a-number', lon: -0.1, modes: ['tube'] },
        { id: 'missing-mode', name: 'Unknown station', lat: 51.5, lon: -0.1 }
    ]);
    const nearest = nearestStation(stations, { lat: 51.5043, lon: -0.1053 });

    assert.equal(stations.length, 1);
    assert.equal(nearest.id, '940GZZLUSWK');
    assert.equal(nearest.name, 'Southwark Underground Station');
    assert.ok(nearest.distanceKm < 0.01);
    assert.equal(nearestStation([], { lat: 0, lon: 0 }), null);
});

test('commute notifications are limited to the configured 30-minute windows', () => {
    assert.equal(isWithinCommuteWindow(new Date(2026, 0, 1, 7, 45), ['07:30', '17:00']), true);
    assert.equal(isWithinCommuteWindow(new Date(2026, 0, 1, 8, 1), ['07:30', '17:00']), false);
    assert.equal(isWithinCommuteWindow(new Date(2026, 0, 1, 16, 45), ['07:30', '17:00']), true);
});

test('commute window supports midnight wraparound and ignores invalid times', () => {
    assert.equal(isWithinCommuteWindow(new Date(2026, 0, 1, 0, 10), ['23:50']), true);
    assert.equal(isWithinCommuteWindow(new Date(2026, 0, 1, 12, 0), ['invalid']), false);
});

test('saved origin, unit and theme preferences are restored with safe defaults', () => {
    const preferences = normalizePreferences({
        origin: { lat: 51.5, lon: -0.12, name: 'Holborn' },
        destination: { lat: 51.515, lon: -0.1415, name: 'Oxford Circus' },
        distanceUnit: 'miles',
        theme: 'light'
    });
    assert.deepEqual(preferences, {
        origin: { lat: 51.5, lon: -0.12, name: 'Holborn' },
        destination: { lat: 51.515, lon: -0.1415, name: 'Oxford Circus' },
        distanceUnit: 'miles',
        theme: 'light'
    });
    assert.deepEqual(normalizePreferences({ origin: { lat: 100, lon: 0 }, distanceUnit: 'yards' }), {
        origin: { lat: 51.5074, lon: -0.1278, name: 'Central London (Default)' },
        destination: null,
        distanceUnit: 'km',
        theme: null
    });
});

test('journey options summarize Tube lines, transfers and disruptions and remove duplicates', () => {
    const legs = [
        {
            mode: { name: 'walking' },
            duration: 5,
            instruction: {
                summary: 'Walk to station',
                steps: [{ description: 'Walk along High Street', distance: 425 }]
            }
        },
        {
            mode: { name: 'tube' },
            duration: 4,
            departurePoint: { commonName: 'Station A' },
            arrivalPoint: { commonName: 'Station B' },
            instruction: { summary: 'Take Central line' },
            routeOptions: [{ name: 'Central' }],
            disruptions: [{ description: 'Central line has minor delays.' }]
        },
        {
            mode: { name: 'tube' },
            duration: 3,
            departurePoint: { commonName: 'Station B' },
            arrivalPoint: { commonName: 'Station C' },
            instruction: { summary: 'Take Jubilee line' },
            routeOptions: [{ name: 'Jubilee' }]
        },
        { mode: { name: 'walking' }, duration: 2, instruction: { summary: 'Walk to destination' } }
    ];
    const journey = { duration: 16, arrivalDateTime: '2026-10-22T14:25:00', legs };
    const routes = normalizeJourneyOptions([
        journey,
        { ...journey, arrivalDateTime: '2026-10-22T14:30:00' },
        { duration: 4, legs: [{ mode: { name: 'walking' }, duration: 4 }] },
        { duration: 10, legs: null }
    ]);

    assert.equal(routes.length, 1);
    assert.deepEqual(routes[0].lines, ['Central', 'Jubilee']);
    assert.equal(routes[0].changes, 1);
    assert.equal(routes[0].walkingMinutes, 7);
    assert.equal(routes[0].walkingDistanceMeters, 425);
    assert.deepEqual(routes[0].legs[0].walkingSteps, [
        { description: 'Walk along High Street', distanceMeters: 425 }
    ]);
    assert.deepEqual(routes[0].disruptions, ['Central line has minor delays.']);
});

test('Tube line sorting supports favorites, proximity, status and alphabetical order', () => {
    const lines = [
        { name: 'Victoria', isPinned: true, distanceKm: 3, statusSeverity: 10 },
        { name: 'Bakerloo', isPinned: false, distanceKm: 1, statusSeverity: 6 },
        { name: 'Central', isPinned: true, distanceKm: 2, statusSeverity: 3 }
    ];
    assert.deepEqual(sortLines(lines, 'favorites').map(line => line.name), ['Central', 'Victoria', 'Bakerloo']);
    assert.deepEqual(sortLines(lines, 'proximity').map(line => line.name), ['Bakerloo', 'Central', 'Victoria']);
    assert.deepEqual(sortLines(lines, 'status').map(line => line.name), ['Central', 'Bakerloo', 'Victoria']);
    assert.deepEqual(sortLines(lines, 'alphabetical').map(line => line.name), ['Bakerloo', 'Central', 'Victoria']);
    assert.deepEqual(lines.map(line => line.name), ['Victoria', 'Bakerloo', 'Central']);
});

test('escapeHtml encodes content that could be interpreted as markup', () => {
    assert.equal(escapeHtml(`<script title="x">&'`), '&lt;script title=&quot;x&quot;&gt;&amp;&#39;');
});
