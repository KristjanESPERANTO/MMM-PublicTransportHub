# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.1.4](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/compare/v0.1.3...v0.1.4) (2026-07-05)


### Added

* add configurable columnOrder for table layout ([6bf1abc](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/6bf1abce3f7db484a1de2c051bbc5eb5e31bf52f))


### Fixed

* compact departure table column spacing ([22b5dc2](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/22b5dc229022529a95f7f26d804cab5a1b910451))
* **hub:** retry on premature-close fetch errors ([f4a2da8](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/f4a2da849337118498c7ad6e26539f4e81ec12a2))


### Chores

* add missing terms to cspell config ([13c0601](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/13c0601e051d0d31689de7fd34b762b837101c87))
* update checkout action to v7 ([8dfbe08](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/8dfbe08d8876fa3ebf0a182e09549ea80756b9b2))
* update dependencies ([57bb81e](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/57bb81e63c99ece1071bde3139cde5bec7fcb019))

## [0.1.3](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/compare/v0.1.2...v0.1.3) (2026-05-19)


### Fixed

* allow direction column to shrink and truncate ([7b8827e](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/7b8827e494c528eae76f3b944bfbd9db22a44bb0)), closes [#4](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/issues/4)
* keep delayed departure visible past planned time ([b02becf](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/b02becf91b3ed36ed339a0f9c8e60116d3592281)), closes [#2](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/issues/2)


### Documentation

* fix installation instructions ([a01ea9e](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/a01ea9e1d21a33f5232195f2af9258c1463c7742))
* remove broken dbweb profile from documentation ([b6df9c7](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/b6df9c75601b0f0a6bfe6b2cf986d5b573e0fea4))


### Chores

* add dependabot config for GitHub Actions and npm updates ([474b02a](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/474b02aa86e0c1208d9e1f91ea81bb6fd56abc48))
* update dependencies ([166f369](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/166f369de377d3dcbc61ceb3359b6e32dc8bb407))


### Code Refactoring

* remove unused hasRealtime alias from departure objects ([f5420a6](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/f5420a6a28429e6a838142ba573a5a08940b33c4))
* simplify past-grace window to a hardcoded 30 s constant ([45918a6](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/45918a64a8ef50bbea8bd25d72cdad4d66aa5329))

## [0.1.2](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/compare/v0.1.1...v0.1.2) (2026-04-26)


### Fixed

* **node_helper:** use MagicMirror core module aliases for logger and node_helper ([a29e473](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/a29e47359e5c3f4fa84388058302e9b44b935437))


### Chores

* update dependencies ([cadd092](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/cadd092c950d65dd2ffb98edbccad361faa366ca))
* update description and add author ([64616ee](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/64616eed1cbeda53dd58a37032ae8ededd4cb3f2))

## 0.1.1 (2026-03-25)


### Added

* replace hideUnreachableDepartures with maxUnreachableDepartures ([7feea8e](https://github.com/KristjanESPERANTO/MMM-PublicTransportHub/commit/7feea8edb4607d542b61cb5a61109ef81ee667d7))

## 0.1.0 (2026-03-22)

Initial release.
