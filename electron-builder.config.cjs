"use strict";

const packageMetadata = require("./package.json");

const config = structuredClone(packageMetadata.build);
const repositorySlug = process.env.GITHUB_REPOSITORY?.trim() || "";
const repositoryMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repositorySlug);

// GitHub Actions supplies GITHUB_REPOSITORY automatically. Keeping this
// dynamic lets local unsigned builds work before the project has a remote,
// while release builds embed the public GitHub update feed in app-update.yml.
if (repositoryMatch) {
  config.win = {
    ...config.win,
    publish: [
      {
        provider: "github",
        owner: repositoryMatch[1],
        repo: repositoryMatch[2],
        releaseType: "release",
      },
    ],
  };
}

// Tagged GitHub releases are the automatic-update trust boundary. Refuse to
// publish an unsigned Windows installer even if a signing secret is missing or
// malformed; unsigned local development packages remain available.
if (process.env.GITHUB_ACTIONS === "true" && process.platform === "win32") {
  config.forceCodeSigning = true;
}

module.exports = config;
