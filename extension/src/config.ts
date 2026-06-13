/**
 * Where the Phantom connector web page is served. It must be an http(s) origin
 * (Phantom does not inject into chrome-extension:// pages) and must match the
 * `externally_connectable.matches` entry in the manifest. For local development
 * this is the connector workspace's Vite dev server.
 */
export const CONNECTOR_URL = "http://localhost:5173/";
