import test from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    haversineDistance,
    isWithinCommuteWindow,
    normalizePreferences,
    sortLines
} from '../app-utils.mjs';

test('haversine distance is zero for the same point', () => {
    assert.equal(haversineDistance(51.5, -0.1, 51.5, -0.1), 0);
});

test('haversine distance returns a plausible London station distance', () => {
    const distance = haversineDistance(51.5074, -0.1278, 51.515, -0.1415);
    assert.ok(distance > 1 && distance < 2);
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
        distanceUnit: 'miles',
        theme: 'light'
    });
    assert.deepEqual(preferences, {
        origin: { lat: 51.5, lon: -0.12, name: 'Holborn' },
        distanceUnit: 'miles',
        theme: 'light'
    });
    assert.deepEqual(normalizePreferences({ origin: { lat: 100, lon: 0 }, distanceUnit: 'yards' }), {
        origin: { lat: 51.5074, lon: -0.1278, name: 'Central London (Default)' },
        distanceUnit: 'km',
        theme: null
    });
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
