// This file is part of cget, copyright (c) 2015-2016 BusFaster Ltd.
// Released under the MIT license, see LICENSE.

console.log(
  `I don't quite understand the purpose of this test, but
	it appears to be a server. You can open another terminal
	window while this server is running and run this request

	curl http://localhost:12345/example.invalid/index.html

	You'll get an HTML response.

	When I started updating this library, the test was
	broken because it was outdated relative to the code.
	The server couldn't even return HTML when I first ran it.
	--AR
	Quit with Ctrl/Cmd-C`
);

import { assignIn } from "lodash";
import * as fs from "fs";
import { fsa } from "../dist/mkdirp";
import * as http from "http";

import { Address, Cache } from "../dist/cget";

var cache = new Cache(process.argv[2], process.argv[3]);

type ArgTbl = { [key: string]: string };

const PORT = 12345;

function parseArgs(query: string) {
  var result: ArgTbl = {};

  if (query) {
    for (var item of query.split("&")) {
      var partList = item.split("=").map(decodeURIComponent);

      if (partList.length == 2) result[partList[0]] = partList[1];
    }
  }

  return result;
}

function reportError(
  res: http.ServerResponse,
  code: number,
  header?: http.OutgoingHttpHeaders
) {
  var body = new Buffer(code + "\n", "utf-8");

  header = assignIn(header || {}, {
    "Content-Type": "text/plain",
    "Content-Length": body.length
  });

  res.writeHead(code, header);

  res.end(body);
}

// Check if there's a cached link redirecting the URL.

function checkRemoteLink(cachePath: string) {
  return fsa.open(cachePath, "r").then((fd: number) => {
    var buf = new Buffer(6);

    return fsa.read(fd, buf, 0, 6, 0).then(() => {
      //fsa.close(fd);

      if (buf.equals(new Buffer("LINK: ", "ascii"))) {
        return fsa
          .readFile(cachePath, { encoding: "utf-8" })
          .then((link: string) => {
            var urlRemote = link.substring(6).replace(/\s+$/, "");

            return urlRemote;
          });
      } else return null;
    });
  });
}

var app = http.createServer(
  (req: http.IncomingMessage, res: http.ServerResponse) => {
    const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    var args = parseArgs(urlObj.search.substring(1));
    var host = args["host"];

    // TODO does localhost not count as a host?
    // When testing on localhost, args["host"] is null,
    // but req.headers.host is "localhost:12345".
    // Since I'm testing on localhost, so I'm adding
    // this kludge so we don't always just get 400.
    if (
      !host &&
      ["localhost", "127.0.0.1"]
        .map((h) => h + ":" + PORT)
        .indexOf(req.headers.host) === -1
    ) {
      reportError(res, 400);
      return;
    }

    urlObj.protocol = "http";
    urlObj.search = "";
    urlObj.host = host;

    cache
      .getCachePath(new Address(urlObj.href))
      .then((cachePath: string) =>
        checkRemoteLink(cachePath)
          .then((urlRemote: string) => {
            if (urlRemote) {
              reportError(res, 302, {
                Location: urlRemote
              });

              return;
            }

            var headerPath = cachePath + ".header.json";

            fsa.stat(cachePath).then((contentStats: fs.Stats) => {
              fsa
                .stat(headerPath)
                .then((headerStats: fs.Stats) =>
                  fsa
                    .readFile(headerPath, { encoding: "utf8" })
                    .then(JSON.parse)
                )
                .catch((err: NodeJS.ErrnoException) => ({
                  "Content-Type": "text/plain;charset=utf-8",
                  "Content-Length": contentStats.size
                }))
                .then((header: any) => {
                  res.writeHead(200, header);

                  fs.createReadStream(cachePath, { encoding: null }).pipe(res);
                });
            });
          })
          .catch((err: NodeJS.ErrnoException) => {
            console.log("404: " + req.url);
            reportError(res, 404);
          })
      );
  }
);

app.listen(PORT);
