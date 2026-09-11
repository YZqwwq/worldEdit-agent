# Homepage resources

The route `WorldEditHomeView.vue` owns a single `createHomePage()` model and
provides it through `homePageKey`. Built-in Vue views use `useHomePage()`.
The default homepage is always available. The optional Canvas homepage contains
both its fragment scene and index display; these are internal UI states.

## Install and remove

Open the titlebar settings, choose Add resource, and select a JSON file.
An example is `resources/home-styles/bookshelf.home.json`.
Installed resources and the selected ID are persisted under
`worldedit.home-resources.v1` in renderer localStorage. Removing the selected
resource returns to default; world data is never removed by uninstalling a style.
The bundled Canvas resource can be removed from the installed list and reinstalled
from settings. Its bundled application code is retained for offline reinstallation.

## Package format

```json
{
  "id": "my-home",
  "name": "My homepage",
  "version": "1.0.0",
  "apiVersion": 1,
  "html": "<!doctype html><html>...</html>"
}
```

IDs contain 3-64 lowercase letters, digits or hyphens and start with a letter.
default, canvas and index are reserved. Version must be three numeric components.
Import accepts files up to 2 MB and HTML up to 1,000,000 characters.
Duplicate IDs are rejected. Remove an installed version before importing its replacement.
Storage quota errors leave the installed state unchanged.

## Data and commands

The resource runs in an opaque-origin iframe with only allow-scripts.
Inline CSS/JavaScript and data images/fonts are supported. Bundle all resources
into the HTML. Network requests, external scripts, frames and form submissions
are blocked. There is no Electron API, Node access or parent DOM access.

After registering a message listener, announce readiness:

```js
parent.postMessage({ type: 'worldedit:home-ready' }, '*')
```

The host sends an initial snapshot and subsequent data/loading/error changes:

```ts
{
  type: 'worldedit:home-state',
  apiVersion: 1,
  worlds: WorldPayload[],
  loading: boolean,
  error: string
}
```

Check `event.source === parent` and the message type in the resource.
WorldPayload includes id, name, summary, status, schemaVersion and timestamps.
Use textContent for user-authored names and summaries.

Request an action using:

```js
parent.postMessage(
  {
    type: 'worldedit:home-action',
    action: 'open',
    worldId: 'an-existing-world-id'
  },
  '*'
)
```

Supported actions: create, open, edit, delete, assistant, reload.
open/edit/delete require an existing worldId. The host validates the source window
and action. Create/edit open host-owned forms; delete opens a host-owned confirmation.
Resources do not receive raw IPC or unrestricted mutation functions.
UI state (search, sorting, canvas animation, display mode) belongs to the resource.
