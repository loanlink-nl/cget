// This file is part of cget, copyright (c) 2015-2016 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

import * as path from "path";
import * as url from "url";

export function sanitizeUrl(urlRemote: string) {
  try {
    const urlObj = new URL(urlRemote);
    var origin = urlObj.host || "";

    if ((urlObj.pathname || "").charAt(0) != "/") origin += "/";

    origin += urlObj.pathname;
    return [
      urlObj.protocol || "http:",
      "//",
      url.resolve("", origin),
      urlObj.search || ""
    ].join("");
  } catch (e) {
    // If URL is invalid, try to construct it with a base
    const urlObj = new URL(urlRemote, "http://dummy");
    var origin = urlObj.host || "";

    if ((urlObj.pathname || "").charAt(0) != "/") origin += "/";

    origin += urlObj.pathname;
    return [
      urlObj.protocol || "http:",
      "//",
      url.resolve("", origin),
      urlObj.search || ""
    ].join("");
  }
}

/** Last line of defence to filter malicious paths. */

export function sanitizePath(path: string) {
  return (
    path
      // Remove unwanted characters.
      .replace(/[^-_./0-9A-Za-z]/g, "_")
      // Remove - _ . / from beginnings of path parts.
      .replace(/(^|\/)[-_./]+/g, "$1")
      // Remove - _ . / from endings of path parts.
      .replace(/[-_./]+($|\/)/g, "$1")
  );
}

export class Address {
  constructor(addressURI: string, cwd?: string) {
    var addressURN: string | null = null;
    var addressURL: string | null = null;
    var cachePath: string;

    if (addressURI.match(/^\.?\.?\//)) {
      // The URI looks more like a local path.
      // TODO: what about if addressURI is just "package.json"?
      cachePath = path.resolve(cwd || ".", addressURI);
      addressURL = url.pathToFileURL(cachePath).href;
      this.isLocal = true;
    } else if (addressURI.substring(0, 5) == "file:") {
      const match = addressURI.match(/^file:(?:\/\/)?(\.?\.?\/?.*)/);
      if (!match) {
        throw new Error(`Invalid input: "${addressURI}"`);
      }
      // path.resolve handles relative file URLs (these may not be valid file URLs):
      //   file://../package.json
      //   file://package.json
      //   file:package.json
      // decodeURIComponent handles URL-encoded file URLs:
      //   file:///home/has%20space/package.json
      cachePath = url.fileURLToPath(
        "file://" + path.resolve(cwd || ".", decodeURIComponent(match[1]))
      );
      addressURL = url.pathToFileURL(cachePath).href;
      this.isLocal = true;
    } else if (addressURI.substring(0, 4) == "urn:") {
      addressURN = addressURI;
      cachePath = addressURN.substring(4).replace(/:/g, "/");
    } else {
      // If the URI is not a URN address, interpret it as a URL address and clean it up.
      addressURL = sanitizeUrl(addressURI);
      const decodedAddressURL = decodeURI(addressURI);
      cachePath = decodedAddressURL.substring(
        decodedAddressURL.indexOf(":") + 1
      );
    }

    this.uri = (addressURN || addressURL)!;
    this.urn = addressURN;
    this.url = addressURL;
    this.path = this.isLocal ? cachePath : sanitizePath(cachePath);
  }

  uri: string;
  urn: string | null;
  url: string | null;
  path: string;
  isLocal = false;
}
