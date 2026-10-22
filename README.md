# Tube Commuter Pro

A static web app for London Underground service status, nearby stations, live arrivals and Tube journey planning, powered by the TfL Open Data API.

## Run locally

Serve the repository over HTTP rather than opening `index.html` directly. Service workers and location features require a secure context (HTTPS or localhost).

For example, with Python installed:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

The app uses relative asset, manifest, and service-worker URLs, so it works both at a custom-domain root and at the repository subpath used by a project site (`https://<owner>.github.io/<repository>/`). To publish directly from this repository, configure GitHub Pages to deploy the `main` branch from the repository root, or select the repository's existing Pages deployment workflow. No build step or dependency install is required for the site; `npm test` runs the tests locally.

## Tests

The distance, commute-window, preference, journey summary, sorting and HTML-escaping utilities are tested with Node's built-in test runner:

```sh
npm test
```

## Offline behavior

After the first online visit, the service worker caches the app shell, external UI assets and successful TfL API responses. Cached service status is labeled with its cache time; live arrivals, location search and journey planning require connectivity. The browser must support service workers, and the app must be served from HTTPS or localhost.

Commute notifications are checked while the app page is open, during the 30 minutes before or after either saved commute time. Browser notifications do not run as background push notifications after the app is closed.

Nearby station distances are straight-line approximations. Journey options use TfL Journey Planner and can include walking legs, Tube lines, transfer counts and reported disruptions. Destination searches are geocoded by OpenStreetMap Nominatim; journey coordinates are then sent to TfL.
