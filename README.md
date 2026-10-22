# London Transit Status

An independent static web app for London Underground service status, nearby stations, live arrivals and Tube journey planning, powered by TfL Open Data.

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

The distance, nearest-station, commute-window, preference, journey summary, sorting and HTML-escaping utilities are tested with Node's built-in test runner:

```sh
npm test
```

## Offline behavior

After the first online visit, the service worker caches the app shell, external UI assets and successful TfL API responses. Cached service status is labeled with its cache time; live arrivals, location search and journey planning require connectivity. The browser must support service workers, and the app must be served from HTTPS or localhost.

Commute notifications are checked while the app page is open, during the 30 minutes before or after either saved commute time. Browser notifications do not run as background push notifications after the app is closed.

Nearby station distances are straight-line approximations. Journey options use TfL Journey Planner and can include walking legs, Tube lines, transfer counts and reported disruptions. Tube station destinations are resolved through TfL first, so station names such as "Southwark" work without adding "station." Other destinations are geocoded by OpenStreetMap Nominatim, subject to its usage policy; requests are user initiated, rate limited to at most one per second per open app, and cached only in memory for the current page session. The endpoint can be changed in `geocoding-config.json` to a compatible service. Coordinate origins, including GPS, are sent as the journey origin so TfL can include walking directions to the station; nearby Tube stations are also shown as an origin reference.

## Privacy and support

The app's [privacy, terms and accessibility notice](./privacy.html) describes local browser storage and third-party requests and provides a control to clear locally saved app data. General support is available through [GitHub Discussions](https://github.com/jcollier-praesto/tfl-status-app/discussions); discussions are public, so do not include personal or confidential information. A private channel for data-protection requests is not currently published.

## Data attribution and branding

The app includes the attribution required by the TfL Transport Data Service licence and OpenStreetMap's ODbL. It is not an official TfL service and does not use TfL's roundel or line-colour branding.
