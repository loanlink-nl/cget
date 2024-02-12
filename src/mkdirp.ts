// This file is part of cget, copyright (c) 2015 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

// Define some simple utility functions to avoid depending on other packages.

import * as fs from "fs";
import * as path from "path";
import * as util from "util";

export const fsa = {
  stat: util.promisify(fs.stat),
  open: util.promisify(fs.open),
  rename: util.promisify(fs.rename) as unknown as (
    src: string,
    dst: string
  ) => Promise<{}>,
  mkdir: util.promisify(fs.mkdir) as (name: string) => Promise<void>,
  read: util.promisify(fs.read),
  readFile: util.promisify(fs.readFile) as unknown as (
    name: string,
    options: { encoding: string; flag?: string }
  ) => Promise<string>,
  writeFile: util.promisify(fs.writeFile) as unknown as (
    name: string,
    content: string,
    options: { encoding: string; flag?: string }
  ) => Promise<{}>
};

const againSymbol = {};
const again = () => againSymbol;

/** Promise while loop. */

export function repeat<T>(
  fn: (again: () => {}) => Promise<T> | undefined
): Promise<T> {
  return util
    .promisify(() => fn(again)!)()
    .then((result: T) => (result == againSymbol ? repeat(fn) : result));
}

/** Create a new directory and its parent directories.
 * If a path component to create conflicts with an existing file,
 * rename to file to <component>/<indexName>. */

export function mkdirp(pathName: string, indexName: string) {
  const partList = path.resolve(pathName).split(path.sep);
  const prefixList = partList.slice(0);
  let pathPrefix: string;

  // Remove path components until an existing directory is found.

  return repeat((again: () => {}) => {
    if (!prefixList.length) return;

    pathPrefix = prefixList.join(path.sep);

    return util
      .promisify(() => fsa.stat(pathPrefix))()
      .then((stats: fs.Stats) => {
        if (stats.isFile()) {
          // Trying to convert a file into a directory.
          // Rename the file to indexName and move it into the new directory.

          const tempPath = pathPrefix + "." + makeTempSuffix(6);

          return util
            .promisify(() => fsa.rename(pathPrefix, tempPath))()
            .then(() => fsa.mkdir(pathPrefix))
            .then(() => fsa.rename(tempPath, path.join(pathPrefix, indexName)));
        } else if (!stats.isDirectory()) {
          throw new Error(
            "Tried to create a directory inside something weird: " + pathPrefix
          );
        }

        return null as unknown as {};
      })
      .catch((err: NodeJS.ErrnoException) => {
        // Re-throw unexpected errors.
        if (err.code != "ENOENT" && err.code != "ENOTDIR") throw err;

        prefixList.pop();
        return again();
      });
  }).then(() =>
    partList.slice(prefixList.length).reduce(
      // Create path components that didn't exist yet.
      async (pathPrefix: any, part: string) => {
        const pathNew = pathPrefix + path.sep + part;

        return await util
          .promisify(() => fsa.mkdir(pathNew))()
          .catch((err: NodeJS.ErrnoException) => {
            // Because of a race condition with simultaneous cache stores,
            // the directory might already exist.

            if (err.code != "EEXIST") throw err;
          })
          .then(() => pathNew);
      },
      pathPrefix
    )
  );
}

/** Create a string of random letters and numbers. */

export function makeTempSuffix(length: number) {
  return Math.floor((Math.random() + 1) * Math.pow(36, length))
    .toString(36)
    .substring(1);
}

export function isDir(cachePath: string) {
  return fsa
    .stat(cachePath)
    .then((stats: fs.Stats) => stats.isDirectory())
    .catch((err: NodeJS.ErrnoException) => false);
}
